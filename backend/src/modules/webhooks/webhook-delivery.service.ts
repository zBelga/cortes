import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { signPayload } from '../../common/utils/hash';
import { RetryableJobError } from '../../common/errors/job-error';

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async deliver(endpointId: string, event: string, payload: unknown): Promise<void> {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
      select: { id: true, url: true, secret: true, active: true },
    });
    if (!endpoint?.active) return;

    const body = JSON.stringify({ event, data: payload, timestamp: Date.now() });
    const signature = signPayload(body, endpoint.secret);

    const delivery = await this.prisma.webhookDelivery.create({
      data: { endpointId, event, payload: payload as never },
      select: { id: true },
    });

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ClipForge-Event': event,
          'X-ClipForge-Signature': `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          statusCode: response.status,
          attempts: { increment: 1 },
          deliveredAt: response.ok ? new Date() : null,
          lastError: response.ok ? null : `HTTP ${response.status}`,
        },
      });

      if (!response.ok) {
        throw new RetryableJobError(`Webhook devolveu ${response.status}`, 'WEBHOOK_FAILED');
      }
    } catch (error) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { attempts: { increment: 1 }, lastError: (error as Error).message.slice(0, 500) },
      });
      throw error;
    }
  }
}
