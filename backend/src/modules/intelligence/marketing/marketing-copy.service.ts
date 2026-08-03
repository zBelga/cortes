import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LlmPort } from '../llm/llm.port';

const copySchema = z.object({
  titles: z.array(z.string().min(3).max(90)).min(1).max(10),
  description: z.string().max(600),
  hashtags: z.array(z.string()).max(12),
  cta: z.string().max(120),
  thumbnailText: z.string().max(30),
});

export type MarketingCopy = z.infer<typeof copySchema>;

const SYSTEM_PROMPT = `Você escreve copy para vídeos curtos (TikTok, Reels, Shorts).
Recebe a transcrição de um corte e gera material de publicação.

Regras:
- 10 títulos distintos, no máximo 60 caracteres, em português.
- Varie os ângulos: pergunta, número, contraste, curiosidade, afirmação direta.
- Nada de clickbait que a transcrição não sustenta. Prometer o que o vídeo não entrega
  derruba a retenção e o alcance.
- Hashtags sem "#", minúsculas, específicas do assunto — evite genéricos como "viral" ou "fyp".
- "thumbnailText": no máximo 3 palavras, alto contraste, legível em miniatura.
- Descrição em até 2 frases.

Responda APENAS com JSON:
{"titles":["..."],"description":"...","hashtags":["..."],"cta":"...","thumbnailText":"..."}`;

@Injectable()
export class MarketingCopyService {
  private readonly logger = new Logger(MarketingCopyService.name);

  constructor(private readonly llm: LlmPort) {}

  async generate(params: {
    transcript: string;
    category: string;
    durationMs: number;
    language: string;
  }): Promise<{ copy: MarketingCopy; costCents: number }> {
    try {
      const response = await this.llm.complete({
        system: SYSTEM_PROMPT,
        user: `Idioma: ${params.language}
Categoria detectada: ${params.category}
Duração: ${Math.round(params.durationMs / 1000)}s

Transcrição do corte:
"""
${params.transcript.slice(0, 6000)}
"""`,
        schema: copySchema,
        temperature: 0.8,
        maxTokens: 1200,
      });
      return { copy: response.data, costCents: response.costCents };
    } catch (error) {
      // Copy é enfeite: se falhar, o corte continua entregue. Nunca derruba o pipeline.
      this.logger.warn(`Falha ao gerar copy: ${(error as Error).message}`);
      return {
        copy: {
          titles: [],
          description: '',
          hashtags: [],
          cta: '',
          thumbnailText: '',
        },
        costCents: 0,
      };
    }
  }
}
