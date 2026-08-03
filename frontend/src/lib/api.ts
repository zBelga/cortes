import { accessToken } from './supabase';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Aborta requisições penduradas — nenhuma tela deve ficar em loading eterno. */
  timeoutMs?: number;
}

/**
 * Cliente HTTP único da aplicação.
 * Centralizar aqui garante que autenticação, timeout e tradução de erro
 * aconteçam da mesma forma em toda tela — sem `fetch` solto em componente.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, timeoutMs = 20_000, headers, ...rest } = options;
  const token = await accessToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // O backend fala RFC 7807; a mensagem já vem pronta para o usuário.
    throw new ApiError(
      response.status,
      payload?.code ?? 'UNKNOWN',
      payload?.title ?? payload?.detail ?? 'Algo deu errado',
      payload?.errors,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, init?: RequestOptions) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, init?: RequestOptions) =>
    request<T>(path, { ...init, method: 'PATCH', body }),
  delete: <T>(path: string, init?: RequestOptions) => request<T>(path, { ...init, method: 'DELETE' }),
};
