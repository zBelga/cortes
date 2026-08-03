# Banco de dados

Postgres 16 (Supabase). Prisma como ORM. Fonte da verdade: `backend/prisma/schema.prisma`.

## Princípios

- **IDs**: `cuid2` (ordenável por tempo, curto, sem vazar contagem).
- **Soft delete** só onde há valor de auditoria (`Project`, `Clip`); o resto é hard delete.
- **JSONB** para payloads de análise que evoluem rápido (`analysisPayload`, `editDocument`),
  com colunas materializadas para o que é consultado (`score`, `startMs`, `endMs`).
- **Sem N+1**: toda listagem usa `select` explícito e agregações no banco.

## Índices que importam

| Tabela | Índice | Por quê |
|---|---|---|
| `Project` | `(userId, createdAt DESC)` | listagem do dashboard, paginada por cursor |
| `Project` | `(status)` parcial em status ativos | painel admin e reconciliação de filas |
| `Clip` | `(projectId, score DESC)` | ranking Top N — cobre a query inteira |
| `Clip` | `(projectId, startMs)` | render da timeline em ordem temporal |
| `TranscriptSegment` | `(transcriptId, startMs)` | busca de trecho por tempo |
| `Export` | `(userId, createdAt DESC)` | histórico de exportações |
| `CreditLedger` | `(userId, createdAt DESC)` | saldo por soma incremental |
| `PipelineStage` | `(pipelineRunId, order)` | render da tela de processamento |

## Modelo de créditos

`CreditLedger` é **append-only** (event sourcing simplificado):
`RESERVE` (negativo, ao criar projeto) → `COMMIT` ou `RELEASE` no fim.
Saldo = `SUM(amount)`. Nada de `UPDATE users SET credits = credits - x`, que é
propenso a race condition. O saldo corrente é cacheado no Redis com invalidação
por escrita.

## Particionamento futuro

`TranscriptSegment` e `ScorePoint` crescem O(duração). Quando passarem de ~50M linhas,
particionar por `createdAt` (mensal) e mover partições frias para storage barato.
