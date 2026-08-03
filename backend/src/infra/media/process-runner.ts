import { spawn } from 'node:child_process';
import { Logger } from '@nestjs/common';
import { RetryableJobError } from '../../common/errors/job-error';

export interface RunOptions {
  /** Chamado a cada linha de stderr — usado para extrair progresso do FFmpeg. */
  onStderrLine?: (line: string) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Executor de processos externos.
 * Usa `spawn` com array de argumentos — **nunca** `exec` com string interpolada,
 * que abriria injeção de shell a partir de URLs fornecidas pelo usuário.
 */
export class ProcessRunner {
  private static readonly logger = new Logger(ProcessRunner.name);

  static run(bin: string, args: string[], options: RunOptions = {}): Promise<string> {
    const { onStderrLine, timeoutMs = 30 * 60_000, signal } = options;

    return new Promise<string>((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });

      let stdout = '';
      let stderrTail = '';
      let buffer = '';

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new RetryableJobError(`${bin} excedeu ${timeoutMs}ms`, 'PROCESS_TIMEOUT'));
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n|\r/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          onStderrLine?.(line);
          // Guarda apenas o fim do stderr: FFmpeg produz megabytes de log.
          stderrTail = `${stderrTail}\n${line}`.slice(-4000);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new RetryableJobError(`Falha ao executar ${bin}: ${error.message}`, 'SPAWN_FAILED', error));
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) return resolve(stdout);
        ProcessRunner.logger.error(`${bin} saiu com código ${code}: ${stderrTail}`);
        reject(new RetryableJobError(`${bin} falhou (código ${code})`, 'PROCESS_FAILED', stderrTail));
      });
    });
  }
}
