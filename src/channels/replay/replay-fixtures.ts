import { type CommerceResponse } from '../../ai/agent.service';
import { type NormalizedInboundMessage } from '../../conversations/conversation.types';
import {
  type ChannelAdapter,
  type ChannelDeliveryResult,
  type ChannelDeliveryTarget,
  type ChannelVerificationResult,
} from '../channel.types';

export type ReplayPayload = {
  externalMessageId: string;
  externalUserId: string;
  text: string;
  fixtureId?: string;
  verification?: 'pass' | 'fail';
  malformed?: boolean;
  delivery?: 'ok' | 'fail_once';
  rawProviderOnly?: string;
};

export type ReplayFixture = {
  id: string;
  channel: 'web';
  merchantId: string;
  correlationId: string;
  raw: ReplayPayload | { malformed: true; fixtureId: string };
  expected: 'delivered' | 'rejected' | 'delivery_failed' | 'duplicate';
};

export const replayFixtures = (merchantId: string): readonly ReplayFixture[] => [
  fixture('persian-search', merchantId, { externalMessageId: 'replay-persian-search', externalUserId: 'replay-shopper', text: 'کفش سفید سایز ۴۲' }),
  fixture('follow-up', merchantId, { externalMessageId: 'replay-follow-up', externalUserId: 'replay-shopper', text: 'the cheaper one' }),
  fixture('no-match', merchantId, { externalMessageId: 'replay-no-match', externalUserId: 'replay-no-match-user', text: 'nothing-matches-this-catalog' }),
  fixture('out-of-stock', merchantId, { externalMessageId: 'replay-out-of-stock', externalUserId: 'replay-out-of-stock-user', text: 'white size 40' }),
  fixture('price-too-high', merchantId, { externalMessageId: 'replay-price-too-high', externalUserId: 'replay-price-user', text: 'white size 43' }),
  fixture('comparison', merchantId, { externalMessageId: 'replay-comparison', externalUserId: 'replay-shopper', text: 'compare second' }),
  fixture('duplicate-delivery', merchantId, { externalMessageId: 'replay-persian-search', externalUserId: 'replay-shopper', text: 'کفش سفید سایز ۴۲' }, 'duplicate'),
  fixture('malformed-payload', merchantId, { malformed: true, fixtureId: 'malformed-payload' }, 'rejected'),
  fixture('unauthorized-merchant', merchantId, { externalMessageId: 'replay-unauthorized', externalUserId: 'replay-unauthorized-user', text: 'white', verification: 'fail' }, 'rejected'),
  fixture('stale-data', merchantId, { externalMessageId: 'replay-stale-data', externalUserId: 'replay-stale-user', text: 'white size 42', rawProviderOnly: 'stale-provider-field' }),
  fixture('delivery-failure', merchantId, { externalMessageId: 'replay-delivery-failure', externalUserId: 'replay-delivery-user', text: 'white size 42', delivery: 'fail_once' }, 'delivery_failed'),
];

export class DeterministicReplayAdapter implements ChannelAdapter<ReplayFixture['raw'], Record<string, unknown>> {
  readonly channel = 'web' as const;
  readonly deliveries: Array<{ outbound: Record<string, unknown>; target: ChannelDeliveryTarget }> = [];
  readonly calls = { verify: 0, normalize: 0, format: 0, deliver: 0 };
  private readonly deliveryAttempts = new Map<string, number>();

  async verify(raw: ReplayFixture['raw']): Promise<ChannelVerificationResult> {
    this.calls.verify += 1;
    if (!this.isPayload(raw)) return { ok: false, errorCode: 'CHANNEL_PAYLOAD_INVALID' };
    if (raw.verification === 'fail') return { ok: false, errorCode: 'CHANNEL_VERIFICATION_FAILED' };
    return { ok: true };
  }

  async normalize(raw: ReplayFixture['raw'], merchantId: string): Promise<NormalizedInboundMessage> {
    this.calls.normalize += 1;
    if (!this.isPayload(raw) || raw.malformed || !raw.text.trim() || !raw.externalMessageId.trim() || !raw.externalUserId.trim()) {
      throw new Error('CHANNEL_PAYLOAD_INVALID');
    }
    return {
      id: `replay-${raw.externalMessageId}`,
      merchantId,
      channel: this.channel,
      externalMessageId: raw.externalMessageId,
      externalUserId: raw.externalUserId,
      type: 'text',
      text: raw.text,
      payload: { fixtureId: raw.fixtureId ?? raw.externalMessageId },
      occurredAt: '2026-08-10T12:00:00.000Z',
    };
  }

  format(response: CommerceResponse): Record<string, unknown> {
    this.calls.format += 1;
    return response.kind === 'product_carousel'
      ? { primitive: 'cards', count: response.items.length }
      : { primitive: response.kind, text: response.text };
  }

  async deliver(outbound: Record<string, unknown>, target: ChannelDeliveryTarget): Promise<ChannelDeliveryResult> {
    this.calls.deliver += 1;
    const attempt = (this.deliveryAttempts.get(target.externalMessageId) ?? 0) + 1;
    this.deliveryAttempts.set(target.externalMessageId, attempt);
    if (target.externalMessageId === 'replay-delivery-failure' && attempt === 1) {
      return { ok: false, errorCode: 'CHANNEL_DELIVERY_FAILED', retryable: true };
    }
    this.deliveries.push({ outbound, target });
    return { ok: true, deliveredAt: '2026-08-10T12:00:01.000Z' };
  }

  private isPayload(value: ReplayFixture['raw']): value is ReplayPayload {
    return 'externalMessageId' in value && 'externalUserId' in value && 'text' in value;
  }
}

function fixture(
  id: string,
  merchantId: string,
  raw: ReplayFixture['raw'],
  expected: ReplayFixture['expected'] = 'delivered',
): ReplayFixture {
  return { id, channel: 'web', merchantId, correlationId: `replay-correlation-${id}`, raw, expected };
}
