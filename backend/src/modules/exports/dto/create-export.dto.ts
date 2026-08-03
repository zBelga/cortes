import { z } from 'zod';
import { AspectRatio, CaptionStyle } from '@prisma/client';
import { editDocumentSchema } from '../../clips/dto/clip.dto';

export const createExportSchema = z.object({
  aspectRatio: z.nativeEnum(AspectRatio).default(AspectRatio.VERTICAL_9_16),
  resolution: z.enum(['1080p', '1440p', '2160p']).default('1080p'),
  fps: z.union([z.literal(30), z.literal(60)]).default(30),
  captionStyle: z.nativeEnum(CaptionStyle).default(CaptionStyle.HORMOZI),
  /** Documento de edição a aplicar; ausente exporta o corte cru. */
  edit: editDocumentSchema.partial().optional(),
});
export type CreateExportDto = z.infer<typeof createExportSchema>;

export const RESOLUTIONS = {
  '1080p': { VERTICAL_9_16: [1080, 1920], SQUARE_1_1: [1080, 1080], HORIZONTAL_16_9: [1920, 1080] },
  '1440p': { VERTICAL_9_16: [1440, 2560], SQUARE_1_1: [1440, 1440], HORIZONTAL_16_9: [2560, 1440] },
  '2160p': { VERTICAL_9_16: [2160, 3840], SQUARE_1_1: [2160, 2160], HORIZONTAL_16_9: [3840, 2160] },
} as const satisfies Record<string, Record<AspectRatio, readonly [number, number]>>;
