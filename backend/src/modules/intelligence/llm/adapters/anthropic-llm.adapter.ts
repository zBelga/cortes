import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { FatalJobError, RetryableJobError } from '../../../../common/errors/job-error';
import { LlmPort, type LlmRequest, type LlmResponse } from '../llm.port';
import { repairJson } from '../json-repair';

const PRICE_PER_1K = { input: 0.03, output: 0.15 } as const; // centavos

@Injectable()
export class AnthropicLlmAdapter extends LlmPort {
  readonly name = 'anthropic';
  private readonly model = 'claude-sonnet-4-20250514';

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async complete<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    if (!this.env.ANTHROPIC_API_KEY) {
      throw new FatalJobError('ANTHROPIC_API_KEY não configurada', 'MISSING_CREDENTIALS');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: request.maxTokens ?? 4000,
        temperature: request.temperature ?? 0.4,
        system: `${request.system}\n\nResponda EXCLUSIVAMENTE com um objeto JSON válido, sem cercas de código.`,
        messages: [{ role: 'user', content: request.user }],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableJobError(`Anthropic ${response.status}`, 'PROVIDER_BUSY', body);
      }
      throw new FatalJobError(`Anthropic ${response.status}: ${body.slice(0, 200)}`, 'LLM_FAILED');
    }

    const payload = (await response.json()) as {
      content: { type: string; text: string }[];
      usage?: { input_tokens: number; output_tokens: number };
    };

    const text = payload.content.find((c) => c.type === 'text')?.text ?? '{}';
    const data = request.schema.parse(JSON.parse(repairJson(text)));

    const usage = payload.usage;
    const costCents = usage
      ? (usage.input_tokens / 1000) * PRICE_PER_1K.input +
        (usage.output_tokens / 1000) * PRICE_PER_1K.output
      : 0;

    return { data, model: this.model, costCents: Math.ceil(costCents) };
  }
}
