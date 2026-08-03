# Escalabilidade

## Gargalos, em ordem de chegada

1. **CPU de FFmpeg.** Chega primeiro. Mitigação: `-c copy` sempre que possível
   (corte em keyframe sem reencode), NVENC/QSV quando disponível, e escala
   horizontal do `worker-media`.
2. **Custo/latência de transcrição.** Mitigação: VAD para pular silêncio,
   áudio a 16 kHz mono, batching, cache por hash do áudio, e opção self-hosted
   (faster-whisper int8) quando o volume justificar.
3. **Egress de vídeo.** Mitigação: R2 (egress zero) + CDN + HLS para preview
   em vez de baixar o MP4 inteiro.
4. **Conexões Postgres.** Mitigação: PgBouncer em transaction mode,
   `connection_limit` explícito no Prisma, réplica de leitura para admin/analytics.
5. **Fan-out de WebSocket.** Mitigação: adapter Redis, rooms por projeto,
   throttle de eventos de progresso a 4/s por projeto.

## Cache

| Camada | O quê | TTL | Invalidação |
|---|---|---|---|
| CDN | assets, thumbnails, previews | 1 ano (imutável, hash na URL) | — |
| Redis | saldo de créditos, detalhe de projeto, métricas admin | 30–300s | por escrita |
| React Query | listas e detalhes no cliente | `staleTime` 30s | mutação otimista |
| Storage | transcript por hash de áudio | permanente | — |

## Metas de performance

| Métrica | Alvo |
|---|---|
| LCP do dashboard | < 1.2 s |
| INP | < 200 ms |
| API p95 (leitura) | < 120 ms |
| API p95 (escrita) | < 300 ms |
| Bundle inicial (gzip) | < 180 KB |
| Vídeo de 60 min → cortes | < 8 min com 4 workers |
