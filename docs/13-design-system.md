# Design System — ClipForge

## Princípio

Escuro, silencioso e rápido. A cor é **informação**, não decoração: neon aparece
para indicar score, progresso e foco — nunca como fundo de seção inteira.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#050506` | fundo da aplicação |
| `--surface` | `#0B0B0F` | cards, painéis |
| `--surface-2` | `#111117` | hover, elevação |
| `--border` | `rgba(255,255,255,.07)` | divisórias |
| `--border-strong` | `rgba(255,255,255,.14)` | foco, hover |
| `--fg` | `#EDEDF2` | texto primário |
| `--fg-muted` | `#8A8A99` | texto secundário |
| `--violet` | `#8B5CF6` | acento primário |
| `--violet-glow` | `#A78BFA` | brilho, hover |
| `--blue` | `#3B82F6` | acento secundário |
| `--cyan` | `#22D3EE` | destaque de dados |
| `--success` | `#10B981` · `--warn` `#F59E0B` · `--danger` `#EF4444` |

Escala de score: `0–59` cinza · `60–74` azul · `75–89` violeta · `90–100` violeta com glow.

## Tipografia

- UI: **Geist Sans** (fallback: Inter). Números tabulares em métricas.
- Mono: **Geist Mono** (timecodes, logs).
- Escala: 11 / 12 / 13 / 14 / 16 / 20 / 24 / 32 / 44. Line-height 1.5 em texto, 1.15 em títulos.
- Títulos com `letter-spacing: -0.02em`. Isso é 80% da sensação "premium".

## Espaçamento

Base 4 px. Só use múltiplos: 4, 8, 12, 16, 24, 32, 48, 64.
Raio: 8 (controles) · 12 (cards) · 16 (painéis) · 999 (pills).

## Elevação

Sem sombra preta pesada. Elevação = borda mais clara + `inset 0 1px 0 rgba(255,255,255,.04)`
(highlight superior de 1 px). Sombra apenas em overlays.

## Movimento

| Interação | Duração | Easing |
|---|---|---|
| Hover / cor | 120 ms | `ease-out` |
| Entrada de elemento | 220 ms | `cubic-bezier(.16,1,.3,1)` |
| Overlay / modal | 260 ms | `cubic-bezier(.16,1,.3,1)` |
| Layout (shared) | 300 ms | spring `stiffness 400, damping 40` |

Nada passa de 320 ms. Stagger de lista: 24 ms por item, máximo 8 itens.
Tudo respeita `prefers-reduced-motion`.

## Glass

`background: rgba(11,11,15,.72)` + `backdrop-filter: blur(20px) saturate(160%)`
+ borda de 1 px. Usado **só** em elementos flutuantes (topbar, command menu, popovers).
Nunca em card de conteúdo — custa GPU e some com o texto.
