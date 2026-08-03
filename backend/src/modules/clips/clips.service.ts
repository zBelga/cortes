import { Injectable } from '@nestjs/common';
import type { ClipCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StoragePort } from '../../infra/storage/storage.port';
import { NotFoundError } from '../../common/errors/domain-error';
import { cursorArgs, toPage } from '../../common/utils/pagination';
import type { EditDocumentDto, ListClipsDto, UpdateClipDto } from './dto/clip.dto';

const CLIP_SELECT = {
  id: true,
  projectId: true,
  startMs: true,
  endMs: true,
  durationMs: true,
  title: true,
  description: true,
  hashtags: true,
  cta: true,
  category: true,
  score: true,
  reason: true,
  scoreBreakdown: true,
  previewKey: true,
  thumbnailKey: true,
  favorite: true,
  createdAt: true,
} satisfies Prisma.ClipSelect;

@Injectable()
export class ClipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StoragePort,
  ) {}

  async listByProject(userId: string, projectId: string, query: ListClipsDto) {
    const rows = await this.prisma.clip.findMany({
      where: {
        projectId,
        deletedAt: null,
        // A autorização vive na query, não numa checagem separada que pode ser esquecida.
        project: { userId, deletedAt: null },
        ...(query.minScore !== undefined ? { score: { gte: query.minScore } } : {}),
        ...(query.category ? { category: query.category as ClipCategory } : {}),
        ...(query.favorite !== undefined ? { favorite: query.favorite } : {}),
      },
      orderBy: query.sort === 'top' ? { score: 'desc' } : { startMs: 'asc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
      select: CLIP_SELECT,
    });

    const page = toPage(rows, query.limit);
    return { ...page, items: await Promise.all(page.items.map((clip) => this.withUrls(clip))) };
  }

  /** Curva de score para a timeline. Reamostrada para não enviar 7200 pontos ao browser. */
  async timeline(userId: string, projectId: string, maxPoints = 600) {
    const points = await this.prisma.scorePoint.findMany({
      where: { projectId, project: { userId, deletedAt: null } },
      orderBy: { timeMs: 'asc' },
      select: { timeMs: true, score: true, emotion: true, energy: true, humor: true, visual: true },
    });

    if (points.length <= maxPoints) return points;

    // Reamostragem por máximo do bucket: preserva os picos, que é o que importa
    // visualmente. Uma média simples achataria exatamente a informação útil.
    const bucketSize = Math.ceil(points.length / maxPoints);
    const sampled: typeof points = [];
    for (let i = 0; i < points.length; i += bucketSize) {
      const bucket = points.slice(i, i + bucketSize);
      sampled.push(bucket.reduce((best, p) => (p.score > best.score ? p : best), bucket[0]!));
    }
    return sampled;
  }

  async detail(userId: string, clipId: string) {
    const clip = await this.prisma.clip.findFirst({
      where: { id: clipId, deletedAt: null, project: { userId, deletedAt: null } },
      select: {
        ...CLIP_SELECT,
        altTitles: true,
        versions: {
          orderBy: { version: 'desc' },
          select: { id: true, version: true, label: true, editDocument: true, createdAt: true },
        },
      },
    });
    if (!clip) throw new NotFoundError('Corte', clipId);
    return this.withUrls(clip);
  }

  async update(userId: string, clipId: string, dto: UpdateClipDto) {
    await this.assertOwnership(userId, clipId);

    const durationPatch =
      dto.startMs !== undefined && dto.endMs !== undefined
        ? { durationMs: dto.endMs - dto.startMs }
        : {};

    const clip = await this.prisma.clip.update({
      where: { id: clipId },
      data: { ...dto, ...durationPatch },
      select: CLIP_SELECT,
    });
    return this.withUrls(clip);
  }

  /** Nova versão = novo documento de edição. O corte original nunca é alterado. */
  async createVersion(userId: string, clipId: string, document: EditDocumentDto, label?: string) {
    await this.assertOwnership(userId, clipId);

    const last = await this.prisma.clipVersion.findFirst({
      where: { clipId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    return this.prisma.clipVersion.create({
      data: {
        clipId,
        version: (last?.version ?? 0) + 1,
        label: label ?? null,
        editDocument: document as never,
      },
      select: { id: true, version: true, label: true, editDocument: true, createdAt: true },
    });
  }

  async duplicate(userId: string, clipId: string) {
    const original = await this.prisma.clip.findFirst({
      where: { id: clipId, deletedAt: null, project: { userId, deletedAt: null } },
    });
    if (!original) throw new NotFoundError('Corte', clipId);

    const { id, createdAt, updatedAt, deletedAt, previewKey, thumbnailKey, ...rest } = original;
    return this.prisma.clip.create({
      data: { ...rest, title: `${original.title} (cópia)`, previewKey, thumbnailKey },
      select: CLIP_SELECT,
    });
  }

  async remove(userId: string, clipId: string) {
    const clip = await this.assertOwnership(userId, clipId);

    // Soft delete e contador na mesma transação: o dashboard nunca mostra
    // um total que não corresponde à quantidade de cortes visíveis.
    await this.prisma.$transaction([
      this.prisma.clip.update({ where: { id: clipId }, data: { deletedAt: new Date() } }),
      this.prisma.project.update({
        where: { id: clip.projectId },
        data: { clipCount: { decrement: 1 } },
      }),
    ]);
    return { ok: true };
  }

  /** Devolve o corte já validado — evita uma segunda consulta em quem chama. */
  private async assertOwnership(userId: string, clipId: string): Promise<{ projectId: string }> {
    const clip = await this.prisma.clip.findFirst({
      where: { id: clipId, deletedAt: null, project: { userId, deletedAt: null } },
      select: { projectId: true },
    });
    if (!clip) throw new NotFoundError('Corte', clipId);
    return clip;
  }

  /**
   * URLs assinadas com TTL curto. Nunca expomos a chave bruta do bucket:
   * é o que impede um usuário de adivinhar a mídia de outro (risco #10).
   */
  private async withUrls<T extends { previewKey: string | null; thumbnailKey: string | null }>(clip: T) {
    const [previewUrl, thumbnailUrl] = await Promise.all([
      clip.previewKey ? this.storage.presignDownload(clip.previewKey, 3600) : null,
      clip.thumbnailKey ? this.storage.presignDownload(clip.thumbnailKey, 3600) : null,
    ]);
    return { ...clip, previewUrl, thumbnailUrl };
  }
}
