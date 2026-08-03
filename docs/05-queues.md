# Filas e processamento

## Filas

| Fila | Concorrência sugerida | Perfil | Observação |
|---|---|---|---|
| `media` | 2–4 por worker | CPU + rede | FFmpeg/yt-dlp; limitar por núcleos reais |
| `ai` | 8–16 | I/O bound | chamadas de API; rate limit por provider |
| `cpu` | núcleos | CPU puro | scoring, seleção de janelas |
| `render` | 1–2 | CPU/GPU pesado | exportação final |
| `webhooks` | 32 | I/O | entrega com retry |

## Prioridades

`priority = basePriority(plan) - waitingBonus(idadeDoJob)`.
BullMQ usa menor número = maior prioridade. O bônus por idade evita **starvation**
de usuários free quando há muitos Premium na fila.

| Plano | base |
|---|---|
| ENTERPRISE | 1 |
| PRO | 10 |
| STARTER | 50 |
| FREE | 100 |

## Retry

- `attempts: 3`, backoff exponencial 5s → 25s → 125s.
- Erros classificados: `RetryableError` (rede, 429, 5xx) vs `FatalError`
  (vídeo privado, formato inválido, DMCA). Fatal **não** consome tentativas.
- Falha definitiva → `RELEASE` do crédito reservado + webhook `project.failed`.

## Idempotência

`jobId = sha1(projectId + stage + inputHash)`. BullMQ deduplica por `jobId`,
então um replay do flow não duplica trabalho.

## Graceful shutdown

`SIGTERM` → para de aceitar jobs → aguarda os ativos até `SHUTDOWN_TIMEOUT`
→ jobs não finalizados voltam para `waiting` (stalled recovery).
Arquivos temporários vivem em `/tmp/clipforge/{jobId}` e são limpos em `finally`.
