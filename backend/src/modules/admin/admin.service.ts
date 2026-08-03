import { Injectable } from '@nestjs/common';
import { ExportStatus, ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { QueueService } from '../queue/queue.service';

const METRICS_TTL_SECONDS = 30;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
  ) {}

  /** Cacheado por 30s: o painel admin não pode ser o que derruba o banco. */
  async metrics() {
    return this.redis.remember('admin:metrics', METRICS_TTL_SECONDS, async () => {
      const since = new Date(Date.now() - 24 * 3600_000);

      const [users, projects, clips, exportsDone, failures, aiCost, queues] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.project.groupBy({ by: ['status'], _count: true }),
        this.prisma.clip.count({ where: { createdAt: { gte: since } } }),
        this.prisma.export.count({ where: { status: ExportStatus.COMPLETED, createdAt: { gte: since } } }),
        this.prisma.project.count({ where: { status: ProjectStatus.FAILED, createdAt: { gte: since } } }),
        this.prisma.pipelineRun.aggregate({
          where: { createdAt: { gte: since } },
          _sum: { aiCostCents: true },
        }),
        this.queue.stats(),
      ]);

      const byStatus = Object.fromEntries(projects.map((p) => [p.status, p._count]));
      const total = projects.reduce((sum, p) => sum + p._count, 0);

      return {
        users,
        projects: { total, byStatus },
        clipsLast24h: clips,
        exportsLast24h: exportsDone,
        failuresLast24h: failures,
        aiCostLast24hCents: aiCost._sum.aiCostCents ?? 0,
        queues,
        process: {
          rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          uptimeSeconds: Math.round(process.uptime()),
        },
      };
    });
  }

  /** Duração média por etapa — mostra onde o pipeline realmente gasta tempo. */
  async stageTimings() {
    const rows = await this.prisma.pipelineStage.groupBy({
      by: ['key', 'label'],
      where: { durationMs: { not: null }, finishedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      _avg: { durationMs: true },
      _max: { durationMs: true },
      _count: true,
    });

    return rows
      .map((row) => ({
        key: row.key,
        label: row.label,
        samples: row._count,
        avgMs: Math.round(row._avg.durationMs ?? 0),
        maxMs: row._max.durationMs ?? 0,
      }))
      .sort((a, b) => b.avgMs - a.avgMs);
  }

  async users(limit = 50) {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        role: true,
        createdAt: true,
        lastSeenAt: true,
        _count: { select: { projects: true, exports: true } },
      },
    });
  }

  async recentFailures(limit = 30) {
    return this.prisma.project.findMany({
      where: { status: ProjectStatus.FAILED },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        source: true,
        failureCode: true,
        failureHint: true,
        updatedAt: true,
        user: { select: { email: true, plan: true } },
      },
    });
  }
}
