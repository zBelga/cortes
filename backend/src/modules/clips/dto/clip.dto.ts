import { z } from 'zod';

export const listClipsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(24),
  cursor: z.string().cuid().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  category: z.string().optional(),
  favorite: z.coerce.boolean().optional(),
  /** `top` ordena por score; `timeline` ordena por posição no vídeo. */
  sort: z.enum(['top', 'timeline']).default('top'),
});
export type ListClipsDto = z.infer<typeof listClipsSchema>;

export const updateClipSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    startMs: z.number().int().nonnegative().optional(),
    endMs: z.number().int().positive().optional(),
    favorite: z.boolean().optional(),
    hashtags: z.array(z.string().max(40)).max(15).optional(),
    description: z.string().max(800).optional(),
  })
  .refine((v) => v.startMs === undefined || v.endMs === undefined || v.endMs > v.startMs, {
    message: 'endMs deve ser maior que startMs',
    path: ['endMs'],
  });
export type UpdateClipDto = z.infer<typeof updateClipSchema>;

/** Documento declarativo de edição — a base do editor não destrutivo. */
export const editDocumentSchema = z.object({
  trim: z.object({ startMs: z.number().int(), endMs: z.number().int() }).optional(),
  crop: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
  zooms: z
    .array(z.object({ atMs: z.number().int(), durationMs: z.number().int(), scale: z.number().min(1).max(3) }))
    .default([]),
  captions: z
    .object({
      style: z.enum(['NONE', 'HORMOZI', 'MRBEAST', 'CAPCUT', 'TIKTOK', 'GAMING', 'MINIMAL', 'PODCAST', 'ANIME']),
      position: z.enum(['top', 'center', 'bottom']).default('bottom'),
      highlightColor: z.string().regex(/^#[0-9a-f]{6}$/i).default('#8B5CF6'),
    })
    .optional(),
  overlays: z
    .array(
      z.object({
        type: z.enum(['text', 'emoji', 'sticker', 'progress-bar']),
        content: z.string().max(200),
        atMs: z.number().int(),
        durationMs: z.number().int(),
        x: z.number(),
        y: z.number(),
      }),
    )
    .default([]),
  audio: z
    .object({
      musicKey: z.string().optional(),
      musicVolume: z.number().min(0).max(1).default(0.15),
      removeSilence: z.boolean().default(false),
      removeFillers: z.boolean().default(false),
    })
    .optional(),
});
export type EditDocumentDto = z.infer<typeof editDocumentSchema>;
