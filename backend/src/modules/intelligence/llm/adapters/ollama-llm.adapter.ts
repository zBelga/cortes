import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { RetryableJobError } from '../../../../common/errors/job-error';
import { LlmPort, type LlmRequest, type LlmResponse } from '../llm.port';
import { repairJson } from '../json-repair';

/**
 * Modelo de linguagem local via Ollama.
 *
 * O Ollama expõe uma API compatível com a da OpenAI em `/v1/chat/completions`,
 * então este adapter é quase idêntico ao da nuvem. As diferenças existem
 * por causa do que muda de verdade ao rodar um modelo pequeno em casa:
 *
 *  · timeout muito maior — em CPU, uma resposta longa leva minutos;
 *  · reparo de JSON — modelos 7B–8B escapam do formato com alguma frequência;
 *  · custo zero — não há token cobrado.
 */
@Injectable()
export class OllamaLlmAdapter extends LlmPort {
  readonly name = 'ollama';
  private readonly logger = new Logger(OllamaLlmAdapter.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async complete<T>(request: LlmRequest<T>): Promise<LlmResponse<T>> {
    const model = this.env.OLLAMA_MODEL;
    const url = `${this.env.OLLAMA_URL.replace(/\/+$/, '')}/v1/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // O Ollama ignora o token, mas alguns proxies compatíveis exigem o header.
        Authorization: 'Bearer ollama',
      },
      body: JSON.stringify({
        model,
        temperature: request.temperature ?? 0.3,
        max_tokens: request.maxTokens ?? 4000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
      signal: AbortSignal.timeout(20 * 60_000),
    }).catch((error: Error) => {
      throw new RetryableJobError(
        `Ollama inacessível em ${url}. Rode \`pnpm ai:up\` para subir o contêiner.`,
        'PROVIDER_UNAVAILABLE',
        error,
      );
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      // 404 aqui quase sempre significa modelo não baixado — vale dizer isso.
      const hint =
        response.status === 404
          ? ` O modelo "${model}" não está instalado. Rode: docker compose -f docker/docker-compose.yml exec ollama ollama pull ${model}`
          : '';
      throw new RetryableJobError(
        `Ollama ${response.status}: ${body.slice(0, 200)}${hint}`,
        'PROVIDER_ERROR',
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = payload.choices?.[0]?.message?.content ?? '{}';

    let parsed: unknown;
    try {
      parsed = JSON.parse(repairJson(content));
    } catch {
      this.logger.warn(`Resposta ilegível do modelo local: ${content.slice(0, 200)}`);
      throw new RetryableJobError('O modelo local devolveu JSON inválido', 'INVALID_JSON');
    }

    return { data: request.schema.parse(parsed), model, costCents: 0 };
  }
}
