import { z } from 'zod';

/** Amostra por segundo derivada do sinal de áudio. */
export const audioAnalysisSchema = z.object({
  /** Energia RMS normalizada 0..1, uma amostra por segundo. */
  energy: z.array(z.number().min(0).max(1)),
  /** Picos de energia com ataque rápido — risada, grito, explosão. */
  bursts: z.array(z.object({ atMs: z.number(), intensity: z.number(), kind: z.enum(['laugh', 'shout', 'impact']) })),
  silences: z.array(z.object({ startMs: z.number(), endMs: z.number() })),
  /** Média e desvio usados para normalizar o vídeo contra ele mesmo. */
  baseline: z.object({ mean: z.number(), stdDev: z.number() }),
  sampleRateMs: z.number(),
});
export type AudioAnalysis = z.infer<typeof audioAnalysisSchema>;

export const visualAnalysisSchema = z.object({
  /** Timestamps de troca de cena — fronteiras naturais de corte. */
  sceneChanges: z.array(z.number()),
  /** Densidade de cortes por segundo, normalizada 0..1. */
  motion: z.array(z.number().min(0).max(1)),
  sampleRateMs: z.number(),
});
export type VisualAnalysis = z.infer<typeof visualAnalysisSchema>;

export const momentSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  category: z.enum([
    'FUNNY', 'EDUCATIONAL', 'EMOTIONAL', 'SHOCKING', 'GAMEPLAY',
    'RAGE', 'FAIL', 'WIN', 'REACTION', 'STORY', 'HOT_TAKE', 'OTHER',
  ]),
  /** 0..1 — o quão forte é o gancho nos primeiros segundos. */
  hook: z.number().min(0).max(1),
  /** 0..1 — carga emocional. */
  emotion: z.number().min(0).max(1),
  /** 0..1 — o quanto o trecho é auto-contido (entende sem contexto anterior). */
  standalone: z.number().min(0).max(1),
  /** 0..1 — quão inesperado/novo é o conteúdo. */
  novelty: z.number().min(0).max(1),
  title: z.string().min(3).max(90),
  reason: z.string().min(10).max(400),
});
export type Moment = z.infer<typeof momentSchema>;

/**
 * Descarta momentos malformados em vez de rejeitar a resposta inteira.
 *
 * Modelos locais acertam a maioria dos itens e erram um: sem isto, um único
 * `endMs` faltando jogaria fora os outros dezenove momentos válidos —
 * e minutos de inferência junto.
 */
const tolerantMoments = z.preprocess((value) => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => momentSchema.safeParse(item).success);
}, z.array(momentSchema));

export const semanticAnalysisSchema = z.object({
  topics: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []),
    z.array(z.string()),
  ),
  moments: tolerantMoments,
});
export type SemanticAnalysis = z.infer<typeof semanticAnalysisSchema>;
