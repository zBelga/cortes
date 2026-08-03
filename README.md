# ClipForge

Transforma vídeos longos (YouTube, VOD da Twitch, upload) em cortes verticais ranqueados por um Score de Viralização calculado a partir de sinais de texto, áudio e vídeo.

```
ClipForge/
├── frontend/   Next.js 15 · React 19 · TypeScript · Tailwind · shadcn/ui · Framer Motion
├── backend/    NestJS (Fastify) · Prisma · BullMQ · Postgres
├── docs/       arquitetura, fluxo, banco, APIs, filas, deploy, escalabilidade, riscos
└── scripts/    utilitários
```

## Stack de produção

| Camada | Serviço |
|---|---|
| Frontend | Vercel |
| API + Worker | Railway (2 serviços) |
| Banco | Supabase (PostgreSQL) |
| Fila + cache | Upstash (Redis) |
| Storage de vídeo | Cloudflare R2 |
| Transcrição | OpenAI Whisper |
| LLM | OpenAI GPT-4o |

---

## Desenvolvimento local

### Pré-requisitos

```bash
# Node 20+, pnpm 9, ffmpeg, yt-dlp
winget install OpenJS.NodeJS.LTS Gyan.FFmpeg yt-dlp.yt-dlp
corepack enable && corepack prepare pnpm@9 --activate
```

### Configurar

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Preencha `backend/.env` com suas credenciais do Supabase, Upstash, R2 e OpenAI.

### Rodar

```bash
pnpm install
pnpm db:migrate   # cria as tabelas no Supabase
pnpm db:seed      # popula com dados de exemplo
pnpm dev          # api :3333 · worker · web :3000
```

Acesse **http://localhost:3000/dashboard**.

---

## Deploy

### 1. Supabase (banco)

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Copie as strings de conexão em **Settings → Database**
3. Cole em `backend/.env` (`DATABASE_URL` e `DIRECT_DATABASE_URL`)

### 2. Upstash (Redis)

1. Crie um banco em [console.upstash.com](https://console.upstash.com)
2. Copie o `REDIS_URL` (começa com `rediss://`)
3. Cole em `backend/.env`

### 3. Cloudflare R2 (storage)

1. Crie um bucket em **dash.cloudflare.com → R2**
2. Gere um token de API com permissão de leitura/escrita
3. Ative um domínio público para o bucket (aba **Settings → Public access**)
4. Preencha as variáveis `STORAGE_*` em `backend/.env`

### 4. Railway (backend)

1. Novo projeto → **Deploy from GitHub repo** → selecione este repositório
2. Crie o **serviço API**:
   - Config file: `railway.toml`
   - Adicione todas as variáveis de `backend/.env.example` no painel de variáveis
   - `NODE_ENV=production`, `CORS_ORIGINS=https://seu-frontend.vercel.app`
3. Crie o **serviço Worker** (botão "Add service" → mesmo repo):
   - Config file: `railway.worker.toml`
   - Copie as mesmas variáveis de ambiente
4. Na primeira vez, rode as migrations pelo painel do Railway ou localmente:
   ```bash
   pnpm db:deploy
   ```

### 5. Vercel (frontend)

1. Novo projeto → **Import Git Repository** → selecione este repositório
2. **Root Directory**: `frontend`
3. Adicione as variáveis de ambiente:
   ```
   NEXT_PUBLIC_API_URL=https://sua-api.railway.app/api/v1
   NEXT_PUBLIC_WS_URL=https://sua-api.railway.app
   NEXT_PUBLIC_AUTH_MODE=single-user
   ```
4. Deploy

---

## Comandos úteis

| Comando | O que faz |
|---|---|
| `pnpm dev` | roda api + worker + web em modo desenvolvimento |
| `pnpm db:migrate` | cria/atualiza tabelas (desenvolvimento) |
| `pnpm db:deploy` | aplica migrations em produção |
| `pnpm db:seed` | popula com dados de exemplo |
| `pnpm db:studio` | abre Prisma Studio para ver o banco |
| `pnpm db:reset` | apaga e recria o banco local |
| `pnpm test` | roda os testes do motor de score |
| `pnpm typecheck` | checagem de tipos |

---

## Documentação

Comece por [`docs/01-architecture.md`](docs/01-architecture.md).
