import { Injectable, Optional } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { type ChannelAdapter, type ChannelDeliveryResult, type ChannelDeliveryTarget, type ChannelErrorCode } from './channel.types';
import { type InboundChannel } from '../conversations/conversation.types';

export type ChannelAdapterResolution =
  | { ok: true; adapter: ChannelAdapter }
  | { ok: false; errorCode: Extract<ChannelErrorCode, 'CHANNEL_UNSUPPORTED'> };

export type DeliveryRetryRequest = {
  channel: InboundChannel;
  outbound: unknown;
  target: ChannelDeliveryTarget;
  actorId: string;
};

@Injectable()
export class ChannelRegistryService {
  private readonly adapters = new Map<InboundChannel, ChannelAdapter>();

  constructor(@Optional() private readonly audit?: AuditService) {}

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  list(): readonly ChannelAdapter[] {
    return [...this.adapters.values()];
  }

  resolve(channel: InboundChannel): ChannelAdapterResolution {
    const adapter = this.adapters.get(channel);
    return adapter
      ? { ok: true, adapter }
      : { ok: false, errorCode: 'CHANNEL_UNSUPPORTED' };
  }

  async retryDelivery({ channel, outbound, target, actorId }: DeliveryRetryRequest): Promise<ChannelDeliveryResult> {
    if (!actorId.trim() || !this.isSafeCorrelationId(target.correlationId)) throw new Error('a non-empty actorId and safe correlationId are required for delivery retry');
    const resolution = this.resolve(channel);
    const delivery = resolution.ok
      ? await this.deliver(resolution.adapter, outbound, target)
      : { ok: false as const, errorCode: 'CHANNEL_DELIVERY_FAILED' as const, retryable: true as const };
    const metadata = delivery.ok
      ? { merchantId: target.merchantId, channel, correlationId: target.correlationId, outcome: 'delivered' }
      : { merchantId: target.merchantId, channel, correlationId: target.correlationId, outcome: 'failed', errorCode: delivery.errorCode, retryable: delivery.retryable };
    await this.audit?.record('channel.delivery_retried', 'channel_delivery', target.correlationId, actorId, metadata);
    return delivery;
  }

  private async deliver(adapter: ChannelAdapter, outbound: unknown, target: ChannelDeliveryTarget): Promise<ChannelDeliveryResult> {
    try {
      return await adapter.deliver(outbound, target);
    } catch {
      return { ok: false, errorCode: 'CHANNEL_DELIVERY_FAILED', retryable: true };
    }
  }

  private isSafeCorrelationId(value: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
  }
}
