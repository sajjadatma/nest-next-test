import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AppModule } from '../../src/app.module';
import request from 'supertest';

describe('web conversation API integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let merchantA: string;
  let merchantB: string;
  let conversationId: string;
  let firstMessageId: string;
  let cheapProductId: string;

  const headers = (merchantId: string, externalUserId = 'web-conversation-user') => ({
    'x-merchant-id': merchantId,
    'x-web-user-id': externalUserId,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const [firstMerchant, secondMerchant] = await Promise.all([
      prisma.merchant.create({ data: { slug: 'web-conversation-a', name: 'Web conversation A' } }),
      prisma.merchant.create({ data: { slug: 'web-conversation-b', name: 'Web conversation B' } }),
    ]);
    merchantA = firstMerchant.id;
    merchantB = secondMerchant.id;
    const category = await prisma.category.create({ data: { slug: 'web-conversation-shoes', name: 'Shoes' } });
    const [cheap, premium] = await Promise.all([
      prisma.product.create({ data: { merchantId: merchantA, name: 'White Budget Runner', slug: 'web-white-budget', description: 'white running shoe', categoryId: category.id, priceMinor: 900, stockQty: 3 } }),
      prisma.product.create({ data: { merchantId: merchantA, name: 'White Premium Runner', slug: 'web-white-premium', description: 'white running shoe', categoryId: category.id, priceMinor: 1200, stockQty: 2 } }),
    ]);
    cheapProductId = cheap.id;
    const [cheapVariant, premiumVariant] = await Promise.all([
      prisma.productVariant.create({ data: { productId: cheap.id, sku: 'WEB-CONVERSATION-CHEAP', color: 'White', size: '42', priceMinor: 900, currency: 'IRR', stockQty: 3, isDefault: true } }),
      prisma.productVariant.create({ data: { productId: premium.id, sku: 'WEB-CONVERSATION-PREMIUM', color: 'White', size: '42', priceMinor: 1200, currency: 'IRR', stockQty: 2, isDefault: true } }),
    ]);
    await Promise.all([
      prisma.product.update({ where: { id: cheap.id }, data: { defaultVariantId: cheapVariant.id } }),
      prisma.product.update({ where: { id: premium.id }, data: { defaultVariantId: premiumVariant.id } }),
    ]);
  });

  afterAll(async () => app.close());

  it('normalizes a web search, returns verified cards, persists intent/state, and carries correlation to audit', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/conversations/messages')
      .set(headers(merchantA))
      .set('x-request-id', 'web-conversation-correlation')
      .send({ text: 'white runner size 42', externalMessageId: 'web-message-1' });

    expect(response.status).toBe(201);
    expect(response.headers['x-request-id']).toBe('web-conversation-correlation');
    expect(response.body).toMatchObject({ reply: { kind: 'product_carousel', items: expect.arrayContaining([expect.objectContaining({ productId: cheapProductId, priceMinor: 900, currency: 'IRR', availability: 'in_stock' })]) } });
    conversationId = response.body.conversationId as string;
    firstMessageId = response.body.messageId as string;
    await expect(prisma.message.findUniqueOrThrow({ where: { id: firstMessageId } })).resolves.toMatchObject({ merchantId: merchantA, channel: 'web', intent: { intent: 'refine_search', size: '42' } });
    await expect(prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).resolves.toMatchObject({ referenceState: { lastCarousel: expect.arrayContaining([expect.objectContaining({ productId: cheapProductId })]) } });
    await expect(prisma.auditLog.findFirstOrThrow({ where: { action: 'conversation.message.processed', targetId: firstMessageId } })).resolves.toMatchObject({ metadata: { correlationId: 'web-conversation-correlation', outcome: 'MATCHED' } });
  });

  it('resolves a follow-up from persisted references and makes replay idempotent', async () => {
    const followUp = await request(app.getHttpServer()).post('/api/conversations/messages').set(headers(merchantA)).send({ text: 'the cheaper one', externalMessageId: 'web-message-2' });
    expect(followUp.status).toBe(201);
    await expect(prisma.message.findUniqueOrThrow({ where: { id: followUp.body.messageId as string } })).resolves.toMatchObject({ intent: { referenceProductIds: [cheapProductId] } });

    const replay = await request(app.getHttpServer()).post('/api/conversations/messages').set(headers(merchantA)).send({ text: 'white runner size 42', externalMessageId: 'web-message-1' });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ conversationId, messageId: firstMessageId });
    await expect(prisma.message.count({ where: { merchantId: merchantA, channel: 'web', externalMessageId: 'web-message-1' } })).resolves.toBe(1);
  });

  it('returns an honest no-match response and denies cross-merchant history access', async () => {
    const noMatch = await request(app.getHttpServer()).post('/api/conversations/messages').set(headers(merchantA, 'web-no-match-user')).send({ text: 'nothing-matches-this-catalog', externalMessageId: 'web-message-no-match' });
    expect(noMatch.status).toBe(201);
    expect(noMatch.body).toMatchObject({ reply: { kind: 'product_carousel', items: [] } });

    await expect(request(app.getHttpServer()).get(`/api/conversations/${conversationId}/messages`).set(headers(merchantA))).resolves.toMatchObject({ status: 200, body: { conversationId, messages: expect.any(Array) } });
    await expect(request(app.getHttpServer()).get(`/api/conversations/${conversationId}/messages`).set(headers(merchantB))).resolves.toMatchObject({ status: 404 });
  });
});
