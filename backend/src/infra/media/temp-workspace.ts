import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { env } from '../../config/env';

/**
 * Diretório temporário por job, sempre limpo — inclusive quando o job falha.
 * Sem isto, um worker de longa duração enche o disco em horas.
 */
export class TempWorkspace {
  private static readonly logger = new Logger(TempWorkspace.name);

  private constructor(readonly root: string) {}

  static async create(jobId: string): Promise<TempWorkspace> {
    const root = join(env().TMP_DIR, jobId);
    await fs.mkdir(root, { recursive: true });
    return new TempWorkspace(root);
  }

  path(...segments: string[]): string {
    return join(this.root, ...segments);
  }

  async dispose(): Promise<void> {
    await fs.rm(this.root, { recursive: true, force: true }).catch((error: Error) => {
      TempWorkspace.logger.warn(`Falha ao limpar ${this.root}: ${error.message}`);
    });
  }

  /** Garante o `dispose` mesmo em erro ou cancelamento. */
  static async withWorkspace<T>(jobId: string, fn: (ws: TempWorkspace) => Promise<T>): Promise<T> {
    const workspace = await TempWorkspace.create(jobId);
    try {
      return await fn(workspace);
    } finally {
      await workspace.dispose();
    }
  }
}
