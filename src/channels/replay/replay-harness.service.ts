import { type CommerceResponse } from '../../ai/agent.service';
import { type InboundChannel, type NormalizedInboundMessage } from '../../conversations/conversation.types';
import { type OrchestratorService } from '../../orchestrator/orchestrator.service';
import { ChannelRegistryService } from '../channel-registry.service';
import { type ChannelDeliveryResult, type ChannelDeliveryTarget, type ChannelErrorCode } from '../channel.types';
import { type ReplayFixture } from './replay-fixtures';

export type ReplayResult = {
  fixtureId: string;
  state: 'delivered' | 'rejected' | 'duplicate' | 'delivery_failed';
  errorCode?: ChannelErrorCode;
  messageId?: string;
  conversationId?: string;
  response?: CommerceResponse;
  delivery?: ChannelDeliveryResult;
  retry?: { channel: InboundChannel; outbound: unknown; target: ChannelDeliveryTarget };
};

export type ReplayRun = { results: ReplayResult[] };

type WebOrchestrator = Pick<OrchestratorService, 'handleWebMessage'>;

export class ReplayHarnessService {
  constructor(
    private readonly registry: ChannelRegistryService,
    private readonly orchestrator: WebOrchestrator,
  ) {}

  async run(fixtures: readonly ReplayFixture[]): Promise<ReplayRun> {
    const results: ReplayResult[] = [];
    for (const fixture of fixtures) results.push(await this.runFixture(fixture));
    return { results };
  }

  async retryDelivery(result: ReplayResult): Promise<ChannelDeliveryResult> {
    if (!result.retry) throw new Error('delivery retry is unavailable');
    const resolution = this.registry.resolve(result.retry.channel);
    if (!resolution.ok) return { ok: false, errorCode: 'CHANNEL_DELIVERY_FAILED', retryable: true };
    return resolution.adapter.deliver(result.retry.outbound, result.retry.target);
  }

  private async runFixture(fixture: ReplayFixture): Promise<ReplayResult> {
    const resolution = this.registry.resolve(fixture.channel);
    if (!resolution.ok) return this.rejected(fixture.id, resolution.errorCode);

    const verification = await resolution.adapter.verify(fixture.raw, fixture.merchantId);
    if (!verification.ok) return this.rejected(fixture.id, verification.errorCode);

    let normalized: NormalizedInboundMessage;
    try {
      normalized = await resolution.adapter.normalize(fixture.raw, fixture.merchantId);
      this.assertWebTextMessage(normalized, fixture);
    } catch {
      return this.rejected(fixture.id, 'CHANNEL_PAYLOAD_INVALID');
    }

    const response = await this.orchestrator.handleWebMessage({
      merchantId: normalized.merchantId,
      text: normalized.text,
      externalMessageId: normalized.externalMessageId,
      externalUserId: normalized.externalUserId,
      correlationId: fixture.correlationId,
    });
    if (!response.created) {
      return {
        fixtureId: fixture.id,
        state: 'duplicate',
        messageId: response.messageId,
        conversationId: response.conversationId,
        response: response.reply,
      };
    }

    const target = {
      merchantId: normalized.merchantId,
      externalUserId: normalized.externalUserId,
      externalMessageId: normalized.externalMessageId,
      correlationId: fixture.correlationId,
    };
    const outbound = resolution.adapter.format(response.reply);
    const delivery = await resolution.adapter.deliver(outbound, target);
    if (!delivery.ok) {
      return {
        fixtureId: fixture.id,
        state: 'delivery_failed',
        errorCode: delivery.errorCode,
        messageId: response.messageId,
        conversationId: response.conversationId,
        response: response.reply,
        delivery,
        retry: { channel: normalized.channel, outbound, target },
      };
    }
    return {
      fixtureId: fixture.id,
      state: 'delivered',
      messageId: response.messageId,
      conversationId: response.conversationId,
      response: response.reply,
      delivery,
    };
  }

  private rejected(fixtureId: string, errorCode: ChannelErrorCode): ReplayResult {
    return { fixtureId, state: 'rejected', errorCode };
  }

  private assertWebTextMessage(normalized: NormalizedInboundMessage, fixture: ReplayFixture): asserts normalized is NormalizedInboundMessage & { channel: 'web'; type: 'text'; text: string } {
    if (
      normalized.merchantId !== fixture.merchantId
      || normalized.channel !== 'web'
      || normalized.type !== 'text'
      || typeof normalized.text !== 'string'
      || !normalized.text.trim()
    ) {
      throw new Error('CHANNEL_PAYLOAD_INVALID');
    }
  }
}
