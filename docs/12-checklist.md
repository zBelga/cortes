# Checklist de qualidade

## Antes de cada PR
- [ ] `pnpm typecheck` limpo
- [ ] `pnpm lint` limpo
- [ ] Testes novos para regra de negócio nova
- [ ] Sem `console.log`, sem `any`, sem código morto
- [ ] Migração de banco é compatível para trás

## Antes de cada release
- [ ] Estados de loading/vazio/erro verificados em toda tela nova
- [ ] Lighthouse ≥ 95 em Performance e Acessibilidade
- [ ] Bundle inicial < 180 KB gzip (`pnpm analyze`)
- [ ] Rate limit testado nas rotas de escrita
- [ ] Rollback documentado
- [ ] Alertas ativos

## Acessibilidade
- [ ] Navegação completa por teclado
- [ ] Foco visível em todo elemento interativo
- [ ] Contraste ≥ 4.5:1 em texto
- [ ] `prefers-reduced-motion` respeitado
- [ ] Labels em todo input
