import { Module } from '@nestjs/common';
import { env } from '../../../config/env';
import { LlmPort } from './llm.port';
import { OpenAiLlmAdapter } from './adapters/openai-llm.adapter';
import { AnthropicLlmAdapter } from './adapters/anthropic-llm.adapter';
import { OllamaLlmAdapter } from './adapters/ollama-llm.adapter';

/**
 * Seleção do adapter por ambiente. É aqui — e só aqui — que a aplicação
 * decide qual modelo de linguagem usar.
 */
@Module({
  providers: [
    OpenAiLlmAdapter,
    AnthropicLlmAdapter,
    OllamaLlmAdapter,
    {
      provide: LlmPort,
      inject: [OpenAiLlmAdapter, AnthropicLlmAdapter, OllamaLlmAdapter],
      useFactory: (
        openai: OpenAiLlmAdapter,
        anthropic: AnthropicLlmAdapter,
        ollama: OllamaLlmAdapter,
      ): LlmPort => {
        switch (env().LLM_PROVIDER) {
          case 'anthropic':
            return anthropic;
          case 'ollama':
            return ollama;
          default:
            return openai;
        }
      },
    },
  ],
  exports: [LlmPort],
})
export class LlmModule {}
