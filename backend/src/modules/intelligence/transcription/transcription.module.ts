import { Module } from '@nestjs/common';
import { env } from '../../../config/env';
import { TranscriptionPort } from './transcription.port';
import { OpenAiWhisperAdapter } from './adapters/openai-whisper.adapter';
import { FasterWhisperAdapter } from './adapters/faster-whisper.adapter';
import { WhisperCppAdapter } from './adapters/whisper-cpp.adapter';
import { DeepgramAdapter } from './adapters/deepgram.adapter';

/**
 * Seleção do adapter por ambiente. É aqui — e só aqui — que a aplicação
 * decide qual motor de transcrição usar.
 */
@Module({
  providers: [
    OpenAiWhisperAdapter,
    FasterWhisperAdapter,
    WhisperCppAdapter,
    DeepgramAdapter,
    {
      provide: TranscriptionPort,
      inject: [OpenAiWhisperAdapter, FasterWhisperAdapter, WhisperCppAdapter, DeepgramAdapter],
      useFactory: (
        openai: OpenAiWhisperAdapter,
        faster: FasterWhisperAdapter,
        whisperCpp: WhisperCppAdapter,
        deepgram: DeepgramAdapter,
      ): TranscriptionPort => {
        switch (env().TRANSCRIPTION_PROVIDER) {
          case 'whisper-cpp':
            return whisperCpp;
          case 'faster-whisper':
            return faster;
          case 'deepgram':
          case 'assemblyai':
            return deepgram;
          default:
            return openai;
        }
      },
    },
  ],
  exports: [TranscriptionPort],
})
export class TranscriptionModule {}
