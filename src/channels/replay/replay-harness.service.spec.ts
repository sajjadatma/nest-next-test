import { type CommerceResponse } from '../../ai/agent.service';
import { ChannelRegistryService } from '../channel-registry.service';
import { type ChannelAdapter } from '../channel.types';
import { DeterministicReplayAdapter, replayFixtures } from './replay-fixtures';
import { ReplayHarnessService } from './replay-harness.service';

describe('ReplayHarnessService', () => {
  const response: CommerceResponse = { kind: 'text', text: 'verified response' };

  it('defines a channel adapter contract and rejects unsupported channels', () => {
    const adapter: ChannelAdapter = new DeterministicReplayAdapter();
    const registry = new ChannelRegistryService();

    registry.register(adapter);

    expect(registry.resolve('web')).toMatchObject({ ok: true, adapter });
    expect(registry.resolve('telegram')).toEqual({ ok: false, errorCode: 'CHANNEL_UNSUPPORTED' });
  });

  it('verifies before normalization, suppresses duplicate replies, and retries delivery without reprocessing', async () => {
    const registry = new ChannelRegistryService();
    const adapter = new DeterministicReplayAdapter();
    registry.register(adapter);
    const seen = new Map<string, { messageId: string; conversationId: string }>();
    const orchestrator = {
      handleWebMessage: vi.fn(async (input: { externalMessageId?: string }) => {
        const existing = seen.get(input.externalMessageId!);
        if (existing) return { created: false, ...existing, reply: { kind: 'text', text: 'This message has already been processed.' } as CommerceResponse };
        const persisted = { messageId: `message-${seen.size + 1}`, conversationId: `conversation-${seen.size + 1}` };
        seen.set(input.externalMessageId!, persisted);
        return { created: true, ...persisted, reply: response };
      }),
    };
    const harness = new ReplayHarnessService(registry, orchestrator);

    const run = await harness.run(replayFixtures('merchant-1'));
    const deliveryFailure = run.results.find((result) => result.fixtureId === 'delivery-failure')!;
    const retry = await harness.retryDelivery(deliveryFailure);

    expect(run.results.map(({ fixtureId, state }) => ({ fixtureId, state }))).toEqual([
      { fixtureId: 'persian-search', state: 'delivered' },
      { fixtureId: 'follow-up', state: 'delivered' },
      { fixtureId: 'no-match', state: 'delivered' },
      { fixtureId: 'out-of-stock', state: 'delivered' },
      { fixtureId: 'price-too-high', state: 'delivered' },
      { fixtureId: 'comparison', state: 'delivered' },
      { fixtureId: 'duplicate-delivery', state: 'duplicate' },
      { fixtureId: 'malformed-payload', state: 'rejected' },
      { fixtureId: 'unauthorized-merchant', state: 'rejected' },
      { fixtureId: 'stale-data', state: 'delivered' },
      { fixtureId: 'delivery-failure', state: 'delivery_failed' },
    ]);
    expect(run.results.find((result) => result.fixtureId === 'malformed-payload')).toMatchObject({ errorCode: 'CHANNEL_PAYLOAD_INVALID' });
    expect(run.results.find((result) => result.fixtureId === 'unauthorized-merchant')).toMatchObject({ errorCode: 'CHANNEL_VERIFICATION_FAILED' });
    expect(adapter.calls).toMatchObject({ verify: 11, normalize: 9, format: 8, deliver: 9 });
    expect(orchestrator.handleWebMessage).toHaveBeenCalledTimes(9);
    expect(adapter.deliveries).toHaveLength(8);
    expect(retry).toEqual({ ok: true, deliveredAt: '2026-08-10T12:00:01.000Z' });
    expect(orchestrator.handleWebMessage).toHaveBeenCalledTimes(9);
  });
});
