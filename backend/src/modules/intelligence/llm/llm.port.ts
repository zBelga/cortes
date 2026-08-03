import type { ZodSchema } from 'zod';

export interface LlmRequest<T> {
  system: string;
  user: string;
  /** Schema de saída — o adapter garante JSON válido e tipado. */
  schema: ZodSchema<T>;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResponse<T> {
  data: T;
  model: string;
  costCents: number;
}

/**
 * Porta de LLM com saída **estruturada e validada**.
 * Sem isto, um `JSON.parse` de texto livre quebra em produção no primeiro
 * dia em que o modelo resolve escrever "Claro! Aqui está o JSON:".
 */
export abstract class LlmPort {
  abstract readonly name: string;
  abstract complete<T>(request: LlmRequest<T>): Promise<LlmResponse<T>>;
}
