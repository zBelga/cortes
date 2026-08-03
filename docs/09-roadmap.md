# Roadmap

## Fase 1 — Fundação (esta entrega)
- [x] Monorepo, Docker, scripts
- [x] Schema completo do banco
- [x] API NestJS com auth, RBAC, rate limit, filtros de erro
- [x] Filas BullMQ com flow de 13 etapas
- [x] Providers de IA trocáveis (transcrição + LLM)
- [x] Motor de score determinístico e testável
- [x] Design system e telas principais
- [x] Realtime da tela de processamento

## Fase 2 — Editor
- [ ] Editor não destrutivo completo (crop, zoom, blur, stickers)
- [ ] Legendas animadas palavra a palavra (8 estilos)
- [ ] Reenquadramento automático com tracking facial
- [ ] Remoção de silêncios e vícios de linguagem
- [ ] Biblioteca de música e efeitos sonoros

## Fase 3 — Escala
- [ ] Pool de render com GPU
- [ ] HLS para previews
- [ ] Réplica de leitura + PgBouncer
- [ ] Multi-região

## Fase 4 — Plataforma
- [ ] API pública com API keys e quotas
- [ ] Webhooks configuráveis pelo usuário
- [ ] Publicação direta em TikTok/YouTube/Instagram
- [ ] A/B test de títulos e thumbnails
- [ ] Score de retenção segundo a segundo validado com dados reais
