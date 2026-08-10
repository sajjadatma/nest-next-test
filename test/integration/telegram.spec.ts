import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';
import { AuditModule } from '../../src/audit/audit.module';
import { AuditService } from '../../src/audit/audit.service';
import { TelegramModule } from '../../src/channels/telegram/telegram.module';
import { FakeTelegramClient } from '../../src/channels/telegram/fake-telegram-client';
import { TELEGRAM_CLIENT } from '../../src/channels/telegram/telegram-client.port';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RbacModule } from '../../src/rbac/rbac.module';


process.env.TELEGRAM_WEBHOOK_SECRET = 'telegram-integration-secret';
process.env.SHOP_PUBLIC_URL = 'https://shop.example.test';

const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

describe('Telegram webhook integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let client: FakeTelegramClient;
  let merchantA: string;
  let merchantB: string;

  function update(updateId: number, userId = 123, text = 'white runner') {
    return {
      update_id: updateId,
      message: { message_id: updateId + 100, date: 1_723_000_000, from: { id: userId }, text },
    };
  }

  function webhook(merchantId: string, payload: Record<string, unknown>, webhookSecret = secret) {
    return request(app.getHttpServer())
      .post('/api/channels/telegram/webhook')
      .set('x-merchant-id', merchantId)
      .set('x-telegram-bot-api-secret-token', webhookSecret ?? '')
      .send(payload);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, RbacModule, AuditModule, TelegramModule] })
      .overrideProvider(AuditService)
      .useValue({ record: vi.fn().mockResolvedValue(undefined) })
      .overrideProvider(TELEGRAM_CLIENT)
      .useValue(new FakeTelegramClient())
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    client = app.get(TELEGRAM_CLIENT) as FakeTelegramClient;
    merchantA = (await prisma.merchant.create({ data: { slug: 'telegram-merchant-a', name: 'Telegram merchant A' } })).id;
    merchantB = (await prisma.merchant.create({ data: { slug: 'telegram-merchant-b', name: 'Telegram merchant B' } })).id;
    const category = await prisma.category.create({ data: { slug: 'telegram-shoes', name: 'Telegram shoes' } });
    const product = await prisma.product.create({ data: { merchantId: merchantA, name: 'Telegram White Runner', slug: 'telegram-white-runner', description: 'white runner', categoryId: category.id, priceMinor: 900, stockQty: 3 } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: 'TELEGRAM-RUNNER-1', color: 'White', size: '42', priceMinor: 900, stockQty: 3, isDefault: true } });
    await prisma.product.update({ where: { id: product.id }, data: { defaultVariantId: variant.id } });
  });

  afterAll(async () => app?.close());

  it('returns HTTP 200 and sends exactly one outbound message for a verified update', async () => {
    const response = await webhook(merchantA, update(1));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ delivered: true });
    expect(client.deliveries).toHaveLength(1);
    await expect(prisma.message.count({ where: { merchantId: merchantA, channel: 'telegram', externalMessageId: 'update:1' } })).resolves.toBe(1);
  });

  it('returns HTTP 401 with no persistence or delivery for an unverified update', async () => {
    const response = await webhook(merchantA, update(2), 'wrong-secret');
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('CHANNEL_VERIFICATION_FAILED');
    await expect(prisma.message.count({ where: { merchantId: merchantA, channel: 'telegram', externalMessageId: 'update:2' } })).resolves.toBe(0);
    expect(client.deliveries).toHaveLength(1);
  });

  it('returns HTTP 400 for a malformed verified update without side effects', async () => {
    const response = await webhook(merchantA, { update_id: 'not-an-integer' });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('CHANNEL_PAYLOAD_INVALID');
    await expect(prisma.message.count({ where: { merchantId: merchantA, channel: 'telegram' } })).resolves.toBe(1);
    expect(client.deliveries).toHaveLength(1);
  });

  it('treats a duplicate update as an idempotent replay with one persisted message and one reply', async () => {
    const first = await webhook(merchantA, update(3));
    const replay = await webhook(merchantA, update(3));
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ duplicate: true, messageId: first.body.messageId });
    await expect(prisma.message.count({ where: { merchantId: merchantA, channel: 'telegram', externalMessageId: 'update:3' } })).resolves.toBe(1);
    expect(client.deliveries).toHaveLength(2);
  });

  it('keeps identical provider update IDs isolated by merchant', async () => {
    const response = await webhook(merchantB, update(1, 999, 'white runner'));
    expect(response.status).toBe(200);
    await expect(prisma.message.count({ where: { channel: 'telegram', externalMessageId: 'update:1' } })).resolves.toBe(2);
  });
});
