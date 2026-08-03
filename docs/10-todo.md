# TODO técnico

## Bloqueadores para produção
- [ ] Criar projeto Supabase e rodar `prisma migrate deploy`
- [ ] Provisionar bucket R2 + credenciais + lifecycle rules
- [ ] Configurar chaves de OpenAI/Anthropic/Deepgram
- [ ] Stripe: produtos, preços, webhook de assinatura
- [ ] Domínio + certificados + CORS de produção

## Qualidade
- [ ] Testes unitários do `ViralScoreEngine` (alvo: 100% de branches)
- [ ] Testes de integração dos processors com Redis em testcontainer
- [ ] E2E (Playwright): criar projeto → processar → exportar
- [ ] Carga: k6 em `GET /projects` e no gateway WS

## Observabilidade
- [ ] Sentry (frontend + backend)
- [ ] OpenTelemetry ligando request → job
- [ ] Dashboard de custo de IA por projeto
- [ ] Alertas: profundidade de fila, taxa de falha, p95

## Hardening
- [ ] Sandbox do FFmpeg (seccomp / usuário sem privilégio)
- [ ] Scan de upload (magic bytes + antivírus)
- [ ] Rotação de secrets
- [ ] Backup e teste de restore do Postgres
