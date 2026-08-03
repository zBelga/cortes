import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../../config/config.module';
import type { Env } from '../../../config/env.schema';
import { LlmPort } from '../llm/llm.port';
import { formatTimecode } from '../../../common/utils/time';
import { semanticAnalysisSchema, type SemanticAnalysis } from './analysis.types';
import type { TranscriptSegmentDto } from '../transcription/transcription.port';

/**
 * Transcrições longas estouram a janela de contexto — processamos em blocos.
 * O tamanho vem do ambiente porque o ponto ideal depende do modelo:
 * 25 min funciona bem em modelos de nuvem, 10 min em um 8B local.
 */
const OVERLAP_MINUTES = 2;

const SYSTEM_PROMPT = `Você é um editor especialista em cortes virais para TikTok, Reels e Shorts.
Recebe a transcrição com timestamps de um vídeo longo e identifica os trechos com
maior potencial de viralização.

Critérios de um bom corte:
- Gancho forte nos primeiros 3 segundos (pergunta, afirmação polêmica, promessa, tensão).
- Auto-contido: entende-se sem assistir ao que veio antes.
- Tem começo, tensão e desfecho dentro da própria janela.
- Duração entre 15 e 90 segundos.
- Começa e termina em fronteira de frase, nunca no meio de uma palavra.

Rejeite: cumprimentos, leitura de patrocínio, divagações sem desfecho,
trechos que dependem de contexto anterior, silêncio prolongado.

Devolva NO MÁXIMO 8 momentos por bloco — os melhores, não todos os aceitáveis.
Respostas longas demais são truncadas e se perdem.

Responda APENAS com JSON no formato:
{"topics":["..."],"moments":[{"startMs":0,"endMs":0,"category":"FUNNY","hook":0.0,
"emotion":0.0,"standalone":0.0,"novelty":0.0,"title":"...","reason":"..."}]}

"category" ∈ FUNNY, EDUCATIONAL, EMOTIONAL, SHOCKING, GAMEPLAY, RAGE, FAIL, WIN,
REACTION, STORY, HOT_TAKE, OTHER.
"hook", "emotion", "standalone" e "novelty" são notas de 0 a 1.
"title" é uma manchete em português, no máximo 60 caracteres, sem clickbait falso.
"reason" explica em uma frase por que o trecho funciona.`;

@Injectable()
export class SemanticAnalysisService {
  private readonly logger = new Logger(SemanticAnalysisService.name);

  constructor(
    private readonly llm: LlmPort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async analyze(
    segments: TranscriptSegmentDto[],
    language: string,
    onProgress?: (ratio: number) => void,
  ): Promise<{ analysis: SemanticAnalysis; costCents: number }> {
    const chunks = this.chunk(segments);
    const results: SemanticAnalysis[] = [];
    let costCents = 0;

    // Sequencial por design: paralelizar aqui estoura o rate limit do provider
    // e a latência total é dominada pela transcrição, não por isto.
    for (const [index, chunk] of chunks.entries()) {
      try {
        const response = await this.llm.complete({
          system: SYSTEM_PROMPT,
          user: this.renderChunk(chunk, language),
          schema: semanticAnalysisSchema,
          temperature: 0.3,
        });
        results.push(response.data);
        costCents += response.costCents;
      } catch (error) {
        // Um bloco que falha não deve derrubar a análise inteira do vídeo.
        this.logger.warn(`Bloco ${index + 1}/${chunks.length} falhou: ${(error as Error).message}`);
      }
      onProgress?.((index + 1) / chunks.length);
    }

    return { analysis: this.merge(results), costCents };
  }

  private chunk(segments: TranscriptSegmentDto[]): TranscriptSegmentDto[][] {
    if (!segments.length) return [];

    const chunkMs = this.env.SEMANTIC_CHUNK_MINUTES * 60_000;
    const overlapMs = OVERLAP_MINUTES * 60_000;
    const totalMs = segments.at(-1)!.endMs;
    const chunks: TranscriptSegmentDto[][] = [];

    for (let start = 0; start < totalMs; start += chunkMs - overlapMs) {
      const end = start + chunkMs;
      // A sobreposição garante que um momento na fronteira não seja perdido.
      const slice = segments.filter((s) => s.endMs > start && s.startMs < end);
      if (slice.length) chunks.push(slice);
    }
    return chunks;
  }

  private renderChunk(segments: TranscriptSegmentDto[], language: string): string {
    const body = segments
      .map((s) => `[${s.startMs}|${formatTimecode(s.startMs)}] ${s.text}`)
      .join('\n');

    return `Idioma do vídeo: ${language}
Janela analisada: ${formatTimecode(segments[0]!.startMs)} → ${formatTimecode(segments.at(-1)!.endMs)}

Cada linha traz [milissegundos|timecode] seguido da fala.
Use SEMPRE o valor em milissegundos nos campos startMs e endMs.

${body}`;
  }

  /** Junta os blocos e remove momentos duplicados nas regiões de sobreposição. */
  private merge(results: SemanticAnalysis[]): SemanticAnalysis {
    const moments = results
      .flatMap((r) => r.moments)
      .filter((m) => m.endMs > m.startMs)
      .sort((a, b) => a.startMs - b.startMs);

    const deduped: typeof moments = [];
    for (const moment of moments) {
      const previous = deduped.at(-1);
      const overlaps =
        previous &&
        Math.min(previous.endMs, moment.endMs) - Math.max(previous.startMs, moment.startMs) >
          (moment.endMs - moment.startMs) * 0.5;

      if (!overlaps) {
        deduped.push(moment);
        continue;
      }
      // Em caso de duplicata, mantém o de maior gancho.
      if (moment.hook > previous!.hook) deduped[deduped.length - 1] = moment;
    }

    return {
      topics: [...new Set(results.flatMap((r) => r.topics))].slice(0, 20),
      moments: deduped,
    };
  }
}
