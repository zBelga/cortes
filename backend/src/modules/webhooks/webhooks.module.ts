import { Module } from '@nestjs/common';
import { WebhookDispatcher } from './webhook.dispatcher';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Module({
  providers: [WebhookDispatcher, WebhookDeliveryService],
  exports: [WebhookDispatcher, WebhookDeliveryService],
})
export class WebhooksModule {}
