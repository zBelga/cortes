# API — v1

Base: `/api/v1`. Auth: `Authorization: Bearer <supabase_jwt>`.
Erros seguem RFC 7807 (`application/problem+json`).

## Convenções

- Paginação por **cursor**: `?limit=24&cursor=<clipId>` → `{ items, nextCursor }`.
  Offset é proibido — degrada linearmente.
- Toda mutação aceita `Idempotency-Key`.
- Rate limit por usuário e por IP, com custo diferente por rota (criar projeto custa 20×
  uma leitura).

## Endpoints

### Projects
| Método | Rota | Descrição |
|---|---|---|
| POST | `/projects` | cria e enfileira |
| GET | `/projects` | lista (cursor) |
| GET | `/projects/:id` | detalhe + agregados |
| GET | `/projects/:id/pipeline` | estado das 13 etapas |
| POST | `/projects/:id/retry` | reprocessa a partir da etapa que falhou |
| DELETE | `/projects/:id` | soft delete + limpeza no storage |

### Clips
| Método | Rota | Descrição |
|---|---|---|
| GET | `/projects/:id/clips` | lista com filtros `?minScore=&limit=&sort=` |
| GET | `/clips/:id` | detalhe + versões |
| PATCH | `/clips/:id` | trim, título, favorito |
| POST | `/clips/:id/versions` | nova versão a partir de um `EditDocument` |
| POST | `/clips/:id/duplicate` | duplica |
| DELETE | `/clips/:id` | remove |

### Exports
| Método | Rota |
|---|---|
| POST | `/clips/:id/exports` |
| GET | `/exports/:id` |
| GET | `/exports` |

### Uploads
| POST | `/uploads/presign` |

### Billing
| GET | `/billing/balance` · `/billing/history` · POST `/billing/checkout` |

### Admin (`role=ADMIN`)
| GET | `/admin/metrics` · `/admin/queues` · `/admin/users` · `/admin/jobs/:id/logs` |

### Webhooks (saída)
`project.completed`, `clip.created`, `export.completed`, `project.failed`.
Assinados com HMAC-SHA256 em `X-ClipForge-Signature`, retry com backoff 5×.

## WebSocket

`wss://api/realtime` — namespace `/pipeline`.
`subscribe { projectId }` → eventos `stage.update`, `pipeline.completed`, `pipeline.failed`.
