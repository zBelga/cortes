# Deploy

## Topologia

| Componente | Onde | Escala |
|---|---|---|
| `frontend` | Vercel | automática (edge) |
| `api` | Railway / Fly.io | 2+ réplicas, HPA por CPU e RPS |
| `worker-media` | Fly.io (CPU alta) | por profundidade de fila |
| `worker-ai` | Fly.io | por profundidade de fila |
| `worker-render` | Fly.io / GPU pool | por profundidade de fila |
| `postgres` | Supabase | vertical + réplica de leitura |
| `redis` | Upstash / Railway Redis | cluster quando necessário |
| `storage` | Cloudflare R2 | ilimitado |

## Ordem de deploy (zero downtime)

1. Migração de banco **compatível para trás** (expand).
2. Deploy dos workers.
3. Deploy da API.
4. Deploy do frontend.
5. Migração de limpeza (contract), no deploy seguinte.

Nunca renomeie/remova coluna no mesmo deploy que altera o código: expand → migrate → contract.

## Variáveis de ambiente

Ver `backend/.env.example` e `frontend/.env.example`. Todas validadas na
inicialização por Zod — a aplicação **não sobe** com env inválida.

## Healthchecks

- `GET /health/live` — processo vivo.
- `GET /health/ready` — Postgres + Redis + Storage acessíveis.
Workers expõem `/health` na porta de métricas.
