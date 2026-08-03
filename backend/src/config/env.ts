import { envSchema, type Env } from './env.schema';

let cached: Env | null = null;

/** Env validado e memoizado. Único ponto de leitura de `process.env` no projeto. */
export function env(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === 'production';
export const isDev = () => env().NODE_ENV === 'development';
