export interface TranscriptWord {
  /** Palavra. */
  w: string;
  /** Início em ms. */
  s: number;
  /** Fim em ms. */
  e: number;
  /** Confiança 0..1. */
  c: number;
}

export interface TranscriptSegmentDto {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
  speaker?: string;
  words: TranscriptWord[];
}

export interface TranscriptionResult {
  provider: string;
  model: string;
  language: string;
  confidence: number;
  text: string;
  durationMs: number;
  segments: TranscriptSegmentDto[];
  costCents: number;
}

export interface TranscriptionRequest {
  /** Caminho local do WAV 16 kHz mono. */
  audioPath: string;
  durationMs: number;
  /** Dica de idioma; `undefined` deixa o modelo detectar. */
  language?: string;
  onProgress?: (ratio: number) => void;
}

/**
 * Porta de transcrição. Trocar Whisper API por faster-whisper local
 * ou Deepgram é mudar `TRANSCRIPTION_PROVIDER` no ambiente — nenhum
 * arquivo de aplicação muda.
 */
export abstract class TranscriptionPort {
  abstract readonly name: string;
  abstract transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}
