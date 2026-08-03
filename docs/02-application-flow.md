# Fluxo da aplicação

## 1. Ingestão

```
POST /api/v1/projects
{ "source": "YOUTUBE", "url": "https://youtu.be/...", "title": "opcional",
  "preferences": { "minScore": 70, "maxClips": 20, "targetDuration": [15, 60] } }
```

1. `CreateProjectUseCase` valida a URL por provider (regex + resolver de ID).
2. Verifica créditos disponíveis (`billing`) e **reserva** o crédito estimado.
3. Cria `Project(status=QUEUED)` + `PipelineRun` com as 13 etapas em `PENDING`.
4. Enfileira o flow BullMQ. Retorna 202 com o `projectId`.

Upload direto usa presigned PUT na R2 — o binário **nunca** passa pela API.

```
POST /api/v1/uploads/presign  → { uploadUrl, storageKey }
PUT  <uploadUrl>              (browser → R2, multipart)
POST /api/v1/projects         { source: "UPLOAD", storageKey }
```

## 2. Pipeline (BullMQ Flow)

| # | Etapa | Fila | Saída |
|---|---|---|---|
| 1 | `download` | `media` | arquivo fonte na R2 |
| 2 | `probe` | `media` | duração, fps, codec, resolução |
| 3 | `extract-audio` | `media` | WAV 16 kHz mono |
| 4 | `waveform` | `media` | peaks JSON (para a timeline) |
| 5 | `transcribe` | `ai` | texto + palavras + timestamps + idioma |
| 6 | `detect-language` | `ai` | idioma + confiança |
| 7 | `analyze-audio` | `ai` | energia, risadas, gritos, silêncios |
| 8 | `analyze-visual` | `ai` | cenas, movimento, faces, texto em tela |
| 9 | `analyze-semantics` | `ai` | tópicos, ganchos, clímax, storytelling |
| 10 | `score` | `cpu` | curva de score segundo a segundo |
| 11 | `select-clips` | `cpu` | janelas ótimas → cortes candidatos |
| 12 | `render-previews` | `render` | MP4 preview + thumbnail por corte |
| 13 | `generate-marketing` | `ai` | títulos, descrição, hashtags, CTA |

As etapas 7, 8 e 9 rodam **em paralelo** (dependem apenas de 5). O flow do BullMQ
expressa isso como children de um job pai `score`.

## 3. Progresso em tempo real

Cada processor emite:

```ts
emit({ projectId, stage: 'transcribe', status: 'RUNNING',
        progress: 0.42, etaSeconds: 88, message: 'Transcrevendo 12:30 / 29:44' })
```

O `PipelineRun` guarda o estado persistido; o WebSocket apenas antecipa a UI.

## 4. Revisão e edição

O usuário abre `/projects/:id`:
- **Timeline inteligente** com a curva de score colorida por categoria.
- **Grid de cortes** ordenado por score, com filtros (Top 5/10/20, score mínimo).
- Clicar num pico do gráfico faz seek exato no player.

Edições são **não destrutivas**: cada alteração cria uma `ClipVersion` com um
documento de edição (`EditDocument`) — um grafo declarativo de operações
(trim, crop, zoom, legendas, stickers, áudio). O vídeo original nunca é mutado.

## 5. Exportação

```
POST /api/v1/clips/:id/exports
{ "aspectRatio": "9:16", "resolution": "1080p", "fps": 30, "captionStyle": "HORMOZI" }
```

Entra na fila `render` com prioridade derivada do plano. Ao terminar, gera URL
assinada com TTL e dispara webhook `export.completed`.
