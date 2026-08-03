# ClipForge — Arquitetura

## 1. Visão geral

ClipForge é uma plataforma que recebe um vídeo longo (YouTube, VOD da Twitch ou upload)
e devolve um conjunto de cortes verticais prontos para publicação, ranqueados por um
**Score de Viralização** calculado a partir de sinais de texto, áudio e vídeo.

O sistema é dividido em quatro planos de execução independentes e escaláveis:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  EDGE / CLIENT                                                           │
│  Next.js 15 (App Router, RSC, Streaming) · Vercel                        │
│  ├─ Server Components para dados frios (listas, dashboards)              │
│  ├─ Client Components apenas onde há interação (player, editor, timeline)│
│  └─ WebSocket para progresso de pipeline em tempo real                   │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ HTTPS (REST + SSE)   │ WSS
┌───────────────▼──────────────────────▼───────────────────────────────────┐
│  API (NestJS · Fastify adapter) · Railway/Fly.io · stateless · N réplicas │
│  ├─ AuthN/AuthZ (Supabase JWT · JWKS · RBAC)                             │
│  ├─ Casos de uso (application layer)                                     │
│  ├─ Publica jobs no BullMQ · NUNCA processa mídia                        │
│  └─ Realtime Gateway (Socket.IO + adapter Redis para multi-instância)    │
└───────────────┬───────────────────────────┬──────────────────────────────┘
                │                           │
        ┌───────▼────────┐          ┌───────▼─────────┐
        │  PostgreSQL    │          │  Redis          │
        │  (Supabase)    │          │  filas + cache  │
        │  Prisma        │          │  + pub/sub      │
        └────────────────┘          └───────┬─────────┘
                                            │
┌───────────────────────────────────────────▼──────────────────────────────┐
│  WORKERS (processos separados, escala horizontal independente)           │
│  download → probe → audio → transcribe → analyze → score → clip → preview│
│  yt-dlp · FFmpeg · Whisper · LLM · CV                                    │
└───────────────┬──────────────────────────────────────────────────────────┘
                │
        ┌───────▼──────────────────┐
        │ Object Storage (R2)      │
        │ S3-compatible · presign  │
        └──────────────────────────┘
```

## 2. Por que essa separação

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| API stateless separada dos workers | Processar mídia no request | Um FFmpeg de 2h derrubaria o event loop e o autoscaling da API. Separando, a API escala por RPS e o worker por CPU/GPU. |
| BullMQ sobre Redis | Kafka / SQS | Jobs são poucos-milhares/dia, precisam de prioridade por plano, retry com backoff, progresso granular e dependências (flows). BullMQ entrega tudo sem operar um cluster Kafka. |
| Fastify adapter no Nest | Express | ~2x throughput e menor alocação por request. A API é I/O bound. |
| Postgres + Prisma | Mongo | Os dados são fortemente relacionais (projeto → mídia → transcript → segmentos → cortes → exports) e precisamos de agregações e constraints reais. |
| Storage S3-compatível (R2) | Disco local / EBS | Egress zero na R2 é decisivo: servimos vídeo. Workers e API ficam efêmeros. |
| Providers de IA atrás de interfaces | Chamada direta ao SDK | Trocar Whisper API → faster-whisper local → Deepgram deve ser uma env var, não um refactor. |

## 3. Camadas do backend (Clean Architecture pragmática)

```
src/
├── config/           # env tipado e validado (Zod) — única fonte de configuração
├── common/           # guards, filters, interceptors, decorators, erros de domínio
├── infra/            # detalhes: Prisma, Redis, Storage, FFmpeg, yt-dlp, HTTP clients
├── modules/          # um módulo por bounded context
│   └── <ctx>/
│       ├── domain/       # entidades, value objects, regras puras (zero import de infra)
│       ├── application/  # casos de uso, portas (interfaces), DTOs
│       └── interface/    # controllers HTTP, gateways WS, mappers
└── workers/          # processors BullMQ — orquestram casos de uso
```

**Regra de dependência:** `interface → application → domain`. `infra` implementa portas
declaradas em `application`. Nenhum arquivo de `domain` importa Prisma, Nest ou FFmpeg.
Isso é o que torna o motor de score testável em milissegundos, sem banco.

## 4. Bounded contexts

| Contexto | Responsabilidade |
|---|---|
| `identity` | Usuário, sessão, plano, RBAC |
| `projects` | Projeto, fonte (YouTube/Twitch/Upload), ciclo de vida |
| `media` | Arquivo de mídia, metadados de probe, waveform, storage keys |
| `pipeline` | Job, etapas, progresso, retries, eventos |
| `intelligence` | Transcrição, análise multimodal, scoring |
| `clips` | Corte, versões, edições não destrutivas, legendas |
| `exports` | Render, presets, filas de exportação |
| `billing` | Créditos, planos, Stripe |
| `admin` | Observabilidade, filas, usuários, consumo |

## 5. Fluxo de dados de um projeto

Ver `02-application-flow.md`.

## 6. Realtime

- Workers publicam eventos em `Redis pub/sub` no canal `pipeline:{projectId}`.
- O `RealtimeGateway` de cada réplica da API assina o canal e emite para as sockets
  na room `project:{projectId}`.
- O cliente reconecta com backoff exponencial e faz um `GET /projects/:id/pipeline`
  para reconciliar estado — o WebSocket é otimização, nunca a fonte da verdade.

## 7. Idempotência e consistência

- Todo job carrega um `jobKey` determinístico (`{projectId}:{stage}:{attemptInputHash}`).
  Reprocessar é seguro.
- Escritas de resultado usam `upsert` por chave natural, não `create`.
- O estado do projeto é uma máquina de estados explícita (`ProjectStatus`), com
  transições validadas no domínio — não um campo string livre.

## 8. Observabilidade

- Logs estruturados (Pino) com `requestId` / `jobId` / `projectId` em todo log.
- Métricas Prometheus: duração por etapa, profundidade de fila, taxa de falha,
  custo estimado de IA por projeto.
- Tracing OpenTelemetry ligando `request HTTP → job → sub-jobs`.
