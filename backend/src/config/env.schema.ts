import { z } from 'zod';

/**
 * Contrato de ambiente. A aplicação não sobe com env inválida —
 * falhar no boot é infinitamente melhor que falhar em produção às 3h da manhã.
 */
const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const int = (def: number) => z.coerce.number().int().positive().default(def);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: int(3333),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().url(),
    DIRECT_DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url(),

    /**
     * `single-user` desliga a autenticação: toda requisição é atribuída ao
     * dono da instalação. Serve para uso local/self-hosted por uma pessoa.
     * `supabase` é o modo multiusuário, obrigatório em produção compartilhada.
     */
    AUTH_MODE: z.enum(['single-user', 'supabase']).default('single-user'),
    /** Identidade usada no modo single-user. Precisa bater com o seed. */
    SINGLE_USER_EMAIL: z.string().email().default('dev@clipforge.local'),
    SINGLE_USER_NAME: z.string().default('Dev ClipForge'),
    /**
     * Opt-in explícito para rodar single-user com NODE_ENV=production
     * (self-hosted pessoal atrás de rede privada). Sem isto, o boot falha.
     */
    ALLOW_SINGLE_USER_IN_PRODUCTION: bool.default(false),

    SUPABASE_URL: z.string().optional().default(''),
    SUPABASE_JWT_ISSUER: z.string().optional().default(''),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),

    /**
     * `local` guarda os arquivos em disco e os serve pela propria API.
     * `s3`    usa Cloudflare R2 ou qualquer storage S3-compativel.
     */
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),

    // — storage local —
    LOCAL_STORAGE_DIR: z.string().default('./storage'),
    /** URL publica desta API. Compoe os links assinados dos arquivos. */
    PUBLIC_API_URL: z.string().url().default('http://localhost:3333/api/v1'),
    /** Assina os tokens de acesso a arquivo. Precisa ser igual na API e no worker. */
    FILE_TOKEN_SECRET: z.string().default(''),

    // — storage S3 —
    STORAGE_ENDPOINT: z.string().optional().default(''),
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_BUCKET: z.string().optional().default(''),
    STORAGE_ACCESS_KEY_ID: z.string().optional().default(''),
    STORAGE_SECRET_ACCESS_KEY: z.string().optional().default(''),
    STORAGE_PUBLIC_URL: z.string().optional().default(''),
    STORAGE_FORCE_PATH_STYLE: bool.default(false),

    TRANSCRIPTION_PROVIDER: z
      .enum(['openai', 'faster-whisper', 'whisper-cpp', 'deepgram', 'assemblyai'])
      .default('whisper-cpp'),
    LLM_PROVIDER: z.enum(['openai', 'anthropic', 'gemini', 'ollama']).default('ollama'),

    /**
     * Tamanho do bloco enviado ao LLM na análise semântica.
     * Modelos locais têm janela de contexto menor e degradam com blocos
     * grandes — 10 minutos é o ponto onde a qualidade se mantém em 8B.
     */
    SEMANTIC_CHUNK_MINUTES: int(10),

    OPENAI_API_KEY: z.string().optional().default(''),
    ANTHROPIC_API_KEY: z.string().optional().default(''),
    GEMINI_API_KEY: z.string().optional().default(''),
    DEEPGRAM_API_KEY: z.string().optional().default(''),
    ASSEMBLYAI_API_KEY: z.string().optional().default(''),
    FASTER_WHISPER_URL: z.string().url().optional().default('http://localhost:8000'),
    /** Modelo carregado no servidor local de transcrição. */
    WHISPER_MODEL: z.string().default('Systran/faster-whisper-small'),

    OLLAMA_URL: z.string().url().default('http://localhost:11434'),
    OLLAMA_MODEL: z.string().default('llama3.1:8b'),

    // — whisper.cpp (binario local, sem Python nem Docker) —
    WHISPER_BIN: z.string().default('whisper-cli'),
    WHISPER_MODEL_PATH: z.string().default('./models/ggml-small.bin'),
    /** 0 = deixa o whisper.cpp decidir pelo numero de nucleos. */
    WHISPER_THREADS: z.coerce.number().int().min(0).default(0),

    FFMPEG_PATH: z.string().default('ffmpeg'),
    FFPROBE_PATH: z.string().default('ffprobe'),
    YTDLP_PATH: z.string().default('yt-dlp'),
    // Relativo por padrão: `/tmp` não existe no Windows.
    TMP_DIR: z.string().default('./tmp/clipforge'),

    WORKER_MEDIA_CONCURRENCY: int(2),
    WORKER_AI_CONCURRENCY: int(8),
    WORKER_CPU_CONCURRENCY: int(4),
    WORKER_RENDER_CONCURRENCY: int(1),
    SHUTDOWN_TIMEOUT_MS: int(30_000),

    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    RATE_LIMIT_WINDOW_MS: int(60_000),
    RATE_LIMIT_MAX: int(120),
    MAX_UPLOAD_BYTES: int(5_368_709_120),

    STRIPE_SECRET_KEY: z.string().optional().default(''),
    STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
    RESEND_API_KEY: z.string().optional().default(''),
    YOUTUBE_API_KEY: z.string().optional().default(''),
    TWITCH_CLIENT_ID: z.string().optional().default(''),
    TWITCH_CLIENT_SECRET: z.string().optional().default(''),
  })
  .superRefine((env, ctx) => {
    // Credenciais de S3 so fazem sentido no driver correspondente.
    if (env.STORAGE_DRIVER !== 's3') return;

    const required = [
      'STORAGE_ENDPOINT',
      'STORAGE_BUCKET',
      'STORAGE_ACCESS_KEY_ID',
      'STORAGE_SECRET_ACCESS_KEY',
      'STORAGE_PUBLIC_URL',
    ] as const;

    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'obrigatoria quando STORAGE_DRIVER=s3',
        });
      }
    }
  })
  .superRefine((env, ctx) => {
    // Sem segredo estavel, os links de arquivo gerados pelo worker seriam
    // rejeitados pela API - cada processo assinaria com uma chave diferente.
    if (env.STORAGE_DRIVER === 'local' && env.FILE_TOKEN_SECRET.length < 16) {
      ctx.addIssue({
        code: 'custom',
        path: ['FILE_TOKEN_SECRET'],
        message:
          'obrigatoria com STORAGE_DRIVER=local (minimo 16 caracteres). ' +
          'Gere uma com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      });
    }
  })
  .superRefine((env, ctx) => {
    // Cada provider exige a sua credencial — e só a sua. Cobrar uma chave da
    // OpenAI de quem roda tudo local seria atrito sem motivo.
    const needsKey: Partial<Record<string, keyof typeof env>> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY',
      deepgram: 'DEEPGRAM_API_KEY',
      assemblyai: 'ASSEMBLYAI_API_KEY',
    };

    for (const provider of [env.TRANSCRIPTION_PROVIDER, env.LLM_PROVIDER]) {
      const key = needsKey[provider];
      if (key && !env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `obrigatória porque um dos providers está configurado como "${provider}"`,
        });
      }
    }
  })
  .superRefine((env, ctx) => {
    // As credenciais do Supabase só são exigidas quando o modo as usa.
    if (env.AUTH_MODE !== 'supabase') return;

    for (const key of ['SUPABASE_URL', 'SUPABASE_JWT_ISSUER'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `obrigatória quando AUTH_MODE=supabase`,
        });
      }
    }
  })
  .superRefine((env, ctx) => {
    // Trava de segurança: sem esta barreira, um deploy distraído publicaria
    // uma instalação inteira sem autenticação nenhuma.
    const risky =
      env.NODE_ENV === 'production' &&
      env.AUTH_MODE === 'single-user' &&
      !env.ALLOW_SINGLE_USER_IN_PRODUCTION;

    if (risky) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message:
          'single-user com NODE_ENV=production expõe a API sem autenticação. ' +
          'Use AUTH_MODE=supabase, ou confirme com ALLOW_SINGLE_USER_IN_PRODUCTION=true ' +
          'se a instalação é pessoal e não está exposta à internet.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
