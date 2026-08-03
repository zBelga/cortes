import { Injectable, Logger } from '@nestjs/common';
import { LedgerKind } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { InsufficientCreditsError } from '../../common/errors/domain-error';

/** 1 crédito por minuto de vídeo, mínimo de 1. */
export const creditsForDuration = (durationMs: number): number =>
  Math.max(1, Math.ceil(durationMs / 60_000));

const BALANCE_TTL_SECONDS = 60;

/**
 * Créditos em ledger append-only.
 *
 * O padrão é RESERVE → COMMIT (sucesso) ou RELEASE (falha). Nunca
 * `UPDATE users SET credits = credits - x`: sob concorrência isso perde
 * escritas silenciosamente, e o usuário acaba com saldo errado.
 */
@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async balance(userId: string): Promise<number> {
    return this.redis.remember(`credits:${userId}`, BALANCE_TTL_SECONDS, async () => {
      const result = await this.prisma.creditLedger.aggregate({
        where: { userId },
        _sum: { amount: true },
      });
      return result._sum.amount ?? 0;
    });
  }

  /**
   * Reserva créditos numa transação serializável: duas requisições simultâneas
   * do mesmo usuário não conseguem gastar o mesmo saldo.
   */
  async reserve(userId: string, projectId: string, amount: number): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const current = await tx.creditLedger.aggregate({
          where: { userId },
          _sum: { amount: true },
        });
        const available = current._sum.amount ?? 0;
        if (available < amount) throw new InsufficientCreditsError(amount, available);

        await tx.creditLedger.create({
          data: {
            userId,
            kind: LedgerKind.RESERVE,
            amount: -amount,
            reference: projectId,
            description: 'Reserva para processamento',
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    await this.invalidate(userId);
  }

  /** Confirma o consumo. A reserva já debitou — aqui só registramos a conclusão. */
  async commit(userId: string, projectId: string): Promise<void> {
    const reserved = await this.prisma.creditLedger.findFirst({
      where: { userId, reference: projectId, kind: LedgerKind.RESERVE },
      select: { amount: true },
    });
    if (!reserved) return;

    await this.prisma.creditLedger.create({
      data: {
        userId,
        kind: LedgerKind.COMMIT,
        amount: 0,
        reference: projectId,
        description: 'Processamento concluído',
        metadata: { consumed: Math.abs(reserved.amount) },
      },
    });
  }

  /** Devolve o crédito quando o processamento falha. Cobrar por erro nosso é inaceitável. */
  async release(userId: string, projectId: string): Promise<void> {
    const alreadyReleased = await this.prisma.creditLedger.findFirst({
      where: { userId, reference: projectId, kind: LedgerKind.RELEASE },
      select: { id: true },
    });
    if (alreadyReleased) return; // idempotente: retries não creditam duas vezes

    const reserved = await this.prisma.creditLedger.findFirst({
      where: { userId, reference: projectId, kind: LedgerKind.RESERVE },
      select: { amount: true },
    });
    if (!reserved) return;

    await this.prisma.creditLedger.create({
      data: {
        userId,
        kind: LedgerKind.RELEASE,
        amount: Math.abs(reserved.amount),
        reference: projectId,
        description: 'Estorno por falha no processamento',
      },
    });
    await this.invalidate(userId);
    this.logger.log(`Créditos estornados para ${userId} (projeto ${projectId})`);
  }

  async grant(userId: string, amount: number, description: string): Promise<void> {
    await this.prisma.creditLedger.create({
      data: { userId, kind: LedgerKind.GRANT, amount, description },
    });
    await this.invalidate(userId);
  }

  async history(userId: string, limit = 50) {
    return this.prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, kind: true, amount: true, description: true, createdAt: true, reference: true },
    });
  }

  private async invalidate(userId: string): Promise<void> {
    await this.redis.invalidate(`credits:${userId}`);
  }
}
