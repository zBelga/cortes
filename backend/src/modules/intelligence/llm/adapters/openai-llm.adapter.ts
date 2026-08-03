import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { FatalJobError, RetryableJobError } from '../../../../common/errors/job-error';
import { LlmPort, type LlmRequest, type LlmResponse } from '../llm.port';

const PRICE_PER_1K = { input: 0.015, output: 0.06 } as const; // centavos

@Injectable()
export class OpenAiLlmAdapter extends LlmPort {
  readonly name = 'openai';
  private readonly model = 'gpt-4o-mini';

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async complete<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    if (!this.env.OPENAI_API_KEY) {
      throw new FatalJobError('OPENAI_API_KEY não configurada', 'MISSING_CREDENTIALS');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: request.temperature ?? 0.4,
        max_tokens: request.maxTokens ?? 4000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableJobError(`OpenAI ${response.status}`, 'PROVIDER_BUSY', body);
      }
      throw new FatalJobError(`OpenAI ${response.status}: ${body.slice(0, 200)}`, 'LLM_FAILED');
    }

    const payload = (await response.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const content = payload.choices[0]?.message.content ?? '{}';
    // `parse` (não `safeParse`): saída fora do contrato é bug, deve falhar alto.
    const data = request.schema.parse(JSON.parse(content));

    const usage = payload.usage;
    const costCents = usage
      ? (usage.prompt_tokens / 1000) * PRICE_PER_1K.input +
        (usage.completion_tokens / 1000) * PRICE_PER_1K.output
      : 0;

    return { data, model: this.model, costCents: Math.ceil(costCents) };
  }
}
