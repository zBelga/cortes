# Riscos

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| 1 | **Bloqueio do yt-dlp / mudança do YouTube** | Crítico — quebra a ingestão | Camada `SourceResolver` com múltiplas estratégias, pool de saída, atualização automática do yt-dlp, fallback para upload manual, alerta em taxa de erro > 5% |
| 2 | **Direitos autorais / DMCA** | Legal | ToS explícito, o usuário declara ter direitos, retenção curta de mídia fonte, processo de takedown, sem biblioteca pública de conteúdo |
| 3 | **Custo de IA maior que a receita** | Financeiro | Custo por projeto rastreado no ledger, limites por plano, VAD e cache agressivos, provider trocável para negociar preço |
| 4 | **Score sem correlação real com viralização** | Produto | Loop de feedback (`ClipFeedback`), medir performance real dos cortes publicados, versionar o modelo de score e comparar coortes |
| 5 | **Fila entupida por vídeo de 10 h** | Disponibilidade | Limite de duração por plano, chunking do processamento, fila separada para vídeos longos |
| 6 | **Custo de storage** | Financeiro | Mídia fonte expira em 7 dias, previews em 30, exports em 90; lifecycle rules na R2 |
| 7 | **Vendor lock-in em Supabase/R2** | Estratégico | Postgres puro (nada de RLS como única defesa de autorização) e storage S3-compatível |
| 8 | **Upload malicioso** | Segurança | Validação de magic bytes, `ffprobe` em sandbox, limite de tamanho, antivírus, storage sem execução |
| 9 | **Reprocessamento duplicado queimando créditos** | Financeiro/UX | `jobId` determinístico + `Idempotency-Key` na API |
| 10 | **Vazamento de mídia entre usuários** | Segurança | URLs assinadas com TTL curto, chave de storage prefixada por `userId`, autorização checada em toda leitura |
