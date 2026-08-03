/**
 * Erros de domínio são classes, nunca strings soltas.
 * O filter global os traduz para HTTP — o domínio não conhece status code.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
  constructor(resource: string, id?: string) {
    super(id ? `${resource} ${id} não encontrado` : `${resource} não encontrado`, { resource, id });
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  readonly httpStatus = 401;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly httpStatus = 422;
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
}

export class RateLimitError extends DomainError {
  readonly code = 'RATE_LIMITED';
  readonly httpStatus = 429;
}

export class InsufficientCreditsError extends DomainError {
  readonly code = 'INSUFFICIENT_CREDITS';
  readonly httpStatus = 402;
  constructor(required: number, available: number) {
    super(`Créditos insuficientes: são necessários ${required}, disponíveis ${available}`, {
      required,
      available,
    });
  }
}

export class UnsupportedSourceError extends DomainError {
  readonly code = 'UNSUPPORTED_SOURCE';
  readonly httpStatus = 400;
}
