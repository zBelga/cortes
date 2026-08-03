/**
 * Distinção que evita queimar tentativas à toa:
 * rede/429/5xx merecem retry; vídeo privado ou formato inválido não.
 */
export class RetryableJobError extends Error {
  readonly retryable = true as const;
  constructor(
    message: string,
    readonly code = 'RETRYABLE',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RetryableJobError';
  }
}

export class FatalJobError extends Error {
  readonly retryable = false as const;
  constructor(
    message: string,
    readonly code = 'FATAL',
    /** Mensagem acionável exibida ao usuário final. */
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'FatalJobError';
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof FatalJobError) return false;
  if (error instanceof RetryableJobError) return true;
  // Falhas desconhecidas são tratadas como transitórias — o limite de tentativas protege.
  return true;
}
