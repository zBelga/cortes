# Boas práticas do projeto

## Código
- Arquivo com mais de ~200 linhas é sinal de responsabilidade demais. Divida.
- Funções sem efeito colateral por padrão; efeitos ficam nas bordas (controllers, processors).
- Nada de `any`. `unknown` + narrowing, ou tipo próprio.
- Erros de domínio são classes, não strings. O filter global traduz para HTTP.
- Toda entrada externa passa por Zod antes de tocar o domínio.

## Backend
- Controller não contém regra: valida, delega ao caso de uso, mapeia a resposta.
- Repositório devolve entidade de domínio, não modelo do Prisma.
- Nenhuma query sem `select` explícito.
- Job pesado nunca roda no processo da API.

## Frontend
- Server Component é o padrão; `'use client'` é exceção justificada.
- Lista com mais de 50 itens é virtualizada.
- Componente que recebe callback em prop e renderiza lista usa `memo` + `useCallback`.
- Animação só em `transform` e `opacity` (compositor da GPU). Nunca anime `width`/`top`.
- Todo estado assíncrono tem quatro renders desenhados: loading (skeleton), vazio, erro, sucesso.
- Imagem sempre via `next/image` com `sizes` correto.

## Git
- Conventional Commits.
- PR pequeno. Um PR = uma mudança de comportamento.
- CI obrigatório: typecheck, lint, testes, build.
