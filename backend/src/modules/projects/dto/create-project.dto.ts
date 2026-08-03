import { z } from 'zod';
import { ProjectSource } from '@prisma/client';

/** Padrões conhecidos por provedor. Rejeitar cedo evita gastar um worker à toa. */
const URL_PATTERNS: Record<string, RegExp> = {
  YOUTUBE: /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{11}/,
  TWITCH: /^https?:\/\/(www\.)?twitch\.tv\/(videos\/\d+|\w+\/v\/\d+)/,
};

export const projectPreferencesSchema = z.object({
  minScore: z.number().min(0).max(100).default(60),
  maxClips: z.number().int().min(1).max(50).default(20),
  minDurationMs: z.number().int().min(5_000).max(120_000).default(15_000),
  maxDurationMs: z.number().int().min(10_000).max(180_000).default(90_000),
});

export const createProjectSchema = z
  .object({
    source: z.nativeEnum(ProjectSource),
    url: z.string().url().optional(),
    /** Chave devolvida por POST /uploads/presign, para `source = UPLOAD`. */
    storageKey: z.string().optional(),
    title: z.string().min(1).max(180).optional(),
    preferences: projectPreferencesSchema.partial().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.source === ProjectSource.UPLOAD) {
      if (!value.storageKey) {
        ctx.addIssue({ code: 'custom', path: ['storageKey'], message: 'storageKey é obrigatório para upload' });
      }
      return;
    }

    if (!value.url) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'url é obrigatória' });
      return;
    }

    const pattern = URL_PATTERNS[value.source];
    if (pattern && !pattern.test(value.url)) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: `A URL não parece um link válido do ${value.source === 'YOUTUBE' ? 'YouTube' : 'Twitch'}`,
      });
    }
  })
  .refine((v) => !v.preferences || (v.preferences.minDurationMs ?? 0) <= (v.preferences.maxDurationMs ?? Infinity), {
    message: 'minDurationMs não pode ser maior que maxDurationMs',
    path: ['preferences'],
  });

export type CreateProjectDto = z.infer<typeof createProjectSchema>;

export const listProjectsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(24),
  cursor: z.string().cuid().optional(),
  status: z.string().optional(),
  q: z.string().max(120).optional(),
});
export type ListProjectsDto = z.infer<typeof listProjectsSchema>;
