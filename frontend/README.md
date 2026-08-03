# ClipForge · frontend

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Radix · Framer Motion.

## Princípios

- **Server Component é o padrão.** `'use client'` só onde há interação real
  (player, timeline, formulários, tempo real).
- **Nada anima fora de `transform` e `opacity`.** Ambos rodam no compositor;
  animar `width` ou `top` força layout a cada frame.
- **Quatro estados desenhados por tela:** carregando (skeleton com a forma do
  conteúdo), vazio, erro e sucesso.
- **O WebSocket é aceleração, não fonte da verdade.** Se cair, o polling
  mantém a tela correta.

## Estrutura

```
src/
├── app/
│   ├── (marketing)/     landing pública
│   └── (app)/           área autenticada (sidebar + command menu)
├── components/
│   ├── ui/              primitivas do design system
│   ├── layout/          sidebar, topbar, ⌘K
│   ├── clips/           card, grade, anel de score
│   ├── processing/      stepper das 13 etapas, anel de progresso
│   ├── timeline/        curva de viralização
│   └── player/          player com navegação frame a frame
├── hooks/               dados + tempo real
├── lib/                 cliente HTTP, tokens, utilidades
└── types/               contratos compartilhados com a API
```

## Comandos

```bash
pnpm dev        # http://localhost:3000
pnpm build
pnpm typecheck
pnpm lint
```
