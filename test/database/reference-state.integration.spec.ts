import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { IntentParserService } from '../../src/ai/intent-parser.service';
import { ConversationService } from '../../src/conversations/conversation.service';
import { ReferenceStateService } from '../../src/conversations/reference-state.service';
import { type NormalizedInboundMessage } from '../../src/conversations/conversation.types';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('ReferenceStateService database integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let conversations: ConversationService;
  let references: ReferenceStateService;
  let parser: IntentParserService;
  let merchantId: string;

  const inbound = (externalMessageId: string): NormalizedInboundMessage => ({
    id: `clreference${externalMessageId}`,
    merchantId,
    channel: 'web',
    externalMessageId,
    externalUserId: 'reference-user-1',
    type: 'text',
    text: 'message',
    occurredAt: '2026-08-10T12:00:00.000Z',
  });

  const persist = async (externalMessageId: string) => conversations.normalizeAndPersist(inbound(externalMessageId));

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    merchantId = (await prisma.merchant.create({ data: { slug: 'reference-state', name: 'Reference State' } })).id;
    conversations = new ConversationService(prisma as unknown as PrismaService);
    references = new ReferenceStateService(conversations);
    parser = new IntentParserService();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('persists carousel state and resolves positions, cheaper ties, comparison, and refinements by stable ids', async () => {
    const first = await persist('reference-1');
    await references.recordCarousel(merchantId, first.conversation.id, [
      { productId: 'product-z', variantId: 'variant-z', priceMinor: 100, currency: 'USD' },
      { productId: 'product-2', variantId: 'variant-2', priceMinor: 200, currency: 'USD' },
      { productId: 'product-a', variantId: 'variant-a', priceMinor: 100, currency: 'USD' },
    ]);

    const second = await persist('reference-2');
    await expect(references.resolveAndPersist(merchantId, second.conversation.id, second.message.id, parser.parse('the second one'), parser.referenceHint('the second one')))
      .resolves.toMatchObject({ referenceProductIds: ['product-2'] });

    const cheaper = await persist('reference-3');
    await expect(references.resolveAndPersist(merchantId, cheaper.conversation.id, cheaper.message.id, parser.parse('the cheaper one'), parser.referenceHint('the cheaper one')))
      .resolves.toMatchObject({ referenceProductIds: ['product-a'] });

    const comparison = await persist('reference-4');
    await expect(references.resolveAndPersist(merchantId, comparison.conversation.id, comparison.message.id, parser.parse('compare second and third'), parser.referenceHint('compare second and third')))
      .resolves.toMatchObject({ intent: 'compare', referenceProductIds: ['product-2', 'product-a'] });

    const search = await persist('reference-5');
    await references.resolveAndPersist(merchantId, search.conversation.id, search.message.id, {
      intent: 'product_search',
      category: 'shoes',
      attributes: { material: 'leather' },
      confidence: 1,
      missingInformation: [],
    });
    const refinement = await persist('reference-6');
    await expect(references.resolveAndPersist(merchantId, refinement.conversation.id, refinement.message.id, parser.parse('سفید سایز ۴۲')))
      .resolves.toMatchObject({ intent: 'refine_search', category: 'shoes', attributes: { material: 'leather', color: 'white' }, size: '42' });

    const readBack = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversation.id } });
    const persistedIntent = await prisma.message.findUniqueOrThrow({ where: { id: refinement.message.id } });
    expect(readBack.referenceState).toMatchObject({ lastIntent: { category: 'shoes', size: '42' } });
    expect((readBack.referenceState as { lastCarousel: Array<{ productId: string }> }).lastCarousel.map(({ productId }) => productId))
      .toEqual(['product-z', 'product-2', 'product-a']);
    expect(persistedIntent.intent).toMatchObject({ intent: 'refine_search', attributes: { material: 'leather', color: 'white' } });
  });

  it('rejects unavailable positional references deterministically', async () => {
    const message = await persist('reference-invalid');
    await references.recordCarousel(merchantId, message.conversation.id, [
      { productId: 'only-product', variantId: 'only-variant', priceMinor: 100, currency: 'USD' },
    ]);
    await expect(references.resolveAndPersist(merchantId, message.conversation.id, message.message.id, parser.parse('the third one'), parser.referenceHint('the third one')))
      .rejects.toThrow('carousel position 3 is unavailable');
  });
});
