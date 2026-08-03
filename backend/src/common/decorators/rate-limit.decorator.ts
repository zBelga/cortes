import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  /** Máximo de requisições na janela. */
  limit: number;
  /** Janela em milissegundos. */
  windowMs: number;
  /** Custo desta rota em "unidades" — criar projeto custa mais que listar. */
  cost?: number;
}

export const RATE_LIMIT_KEY = 'clipforge:rateLimit';
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
