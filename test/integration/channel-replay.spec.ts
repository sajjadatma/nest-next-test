import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ChannelRegistryService } from '../../src/channels/channel-registry.service';
import { DeterministicReplayAdapter, replayFixtures } from '../../src/channels/replay/replay-fixtures';
import { ReplayHarnessService } from '../../src/channels/replay/replay-harness.service';
import { OrchestratorService } from '../../src/orchestrator/orchestrator.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AppModule } from '../../src/app.module';

describe('channel replay integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let merchantId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    merchantId = (await prisma.merchant.create({ data: { slug: 'channel-replay-merchant', name: 'Channel replay merchant' } })).id;
    const category = await prisma.category.create({ data: { slug: 'channel-replay-shoes', name: 'Shoes' } });
    const products = await Promise.all([
      prisma.product.create({ data: { merchantId, name: 'Replay White Runner One', slug: 'channel-replay-white-one', description: 'white running shoe', categoryId: category.id, priceMinor: 900, stockQty: 3 } }),
      prisma.product.create({ data: { merchantId, name: 'Replay White Runner Two', slug: 'channel-replay-white-two', description: 'white running shoe', categoryId: category.id, priceMinor: 1200, stockQty: 2 } }),
      prisma.product.create({ data: { merchantId, name: 'Replay White Runner Sold Out', slug: 'channel-replay-white-out', description: 'white running shoe', categoryId: category.id, priceMinor: 800, stockQty: 0 } }),
      prisma.product.create({ data: { merchantId, name: 'Replay White Runner Premium', slug: 'channel-replay-white-premium', description: 'white running shoe', categoryId: category.id, priceMinor: 5000, stockQty: 1 } }),
    ]);
    const variants = await Promise.all(products.map((product, index) => prisma.productVariant.create({
      data: { productId: product.id, sku: `CHANNEL-REPLAY-${index + 1}`, color: 'White', size: ['42', '42', '40', '43'][index], priceMinor: [900, 1200, 800, 5000][index], currency: 'IRR', stockQty: [3, 2, 0, 1][index], isDefault: true },
    })));
    await Promise.all(products.map((product, index) => prisma.product.update({ where: { id: product.id }, data: { defaultVariantId: variants[index].id } })));
  });

  afterAll(async () => app.close());

  it('runs the full deterministic fixture set through the adapter boundary and real web orchestrator', async () => {
    const registry = new ChannelRegistryService();
    const adapter = new DeterministicReplayAdapter();
    registry.register(adapter);
    const harness = new ReplayHarnessService(registry, app.get(OrchestratorService));

    const first = await harness.run(replayFixtures(merchantId));
    const deliveryFailure = first.results.find((result) => result.fixtureId === 'delivery-failure')!;
    const deliveryRetry = await harness.retryDelivery(deliveryFailure);
    const replay = await harness.run(replayFixtures(merchantId));

    expect(first.results).toHaveLength(11);
    expect(first.results.map(({ fixtureId, state }) => ({ fixtureId, state }))).toEqual([
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
    expect(first.results.find((result) => result.fixtureId === 'malformed-payload')).toMatchObject({ errorCode: 'CHANNEL_PAYLOAD_INVALID' });
    expect(first.results.find((result) => result.fixtureId === 'unauthorized-merchant')).toMatchObject({ errorCode: 'CHANNEL_VERIFICATION_FAILED' });
    expect(deliveryRetry).toEqual({ ok: true, deliveredAt: '2026-08-10T12:00:01.000Z' });
    expect(replay.results.filter((result) => result.state === 'duplicate')).toHaveLength(9);
    expect(replay.results.filter((result) => result.state === 'rejected')).toHaveLength(2);
    await expect(prisma.message.count({ where: { merchantId, channel: 'web' } })).resolves.toBe(8);
    await expect(prisma.message.count({ where: { merchantId, channel: 'web', externalMessageId: 'replay-persian-search' } })).resolves.toBe(1);
    expect(adapter.deliveries).toHaveLength(8);
    expect(adapter.deliveries.every(({ target }) => target.correlationId.startsWith('replay-correlation-'))).toBe(true);
  });
});
