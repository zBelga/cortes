import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

/**
 * Entrega de webhooks sempre pela fila.
 * Chamar o endpoint do cliente de forma síncrona acoplaria a latência do
 * nosso pipeline à disponibilidade do servidor dele.
 */
@Injectable()
export class WebhookDispatcher {
  private readonly logger = new Logger(WebhookDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async dispatch(userId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { userId, active: true, events: { has: event } },
      select: { id: true },
    });

    await Promise.all(
      endpoints.map((endpoint) => this.queue.enqueueWebhook(endpoint.id, event, payload)),
    );
  }
}
