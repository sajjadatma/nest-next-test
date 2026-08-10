import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ChannelRegistryService } from '../../src/channels/channel-registry.service';
import { TelegramAdapter } from '../../src/channels/telegram/telegram.adapter';
import { FakeTelegramClient } from '../../src/channels/telegram/fake-telegram-client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { validateEnvironment } from '../../src/config/env.validation';

process.env.RETENTION_DAYS = '30';

describe('retention administration integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authorization: string;
  let actorId: string;
  let merchantA: string;
  let merchantB: string;

  it('defaults retention to disabled and rejects negative retention days at configuration validation', () => {
    const base = { DATABASE_URL: 'postgresql://dashboard:***@localhost:5432/dashboard', JWT_SECRET: 'a-secure-jwt-secret-with-more-than-32-chars' };
    expect(validateEnvironment(base).RETENTION_DAYS).toBe(0);
    expect(() => validateEnvironment({ ...base, RETENTION_DAYS: '-1' })).toThrow('Invalid environment configuration');
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const registration = await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'retention-admin@example.com', password: 'password123' });
    authorization = `Bearer ${registration.body.accessToken}`;
    actorId = registration.body.user.id;
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'roles:manage' } });
    await prisma.userPermission.create({ data: { userId: registration.body.user.id, permissionId: permission.id } });
    [merchantA, merchantB] = (await Promise.all([
      prisma.merchant.create({ data: { slug: 'retention-admin-a', name: 'Retention Admin A' } }),
      prisma.merchant.create({ data: { slug: 'retention-admin-b', name: 'Retention Admin B' } }),
    ])).map(({ id }) => id);
  });

  afterAll(async () => app.close());

  it('enforces RolesManage and returns dry-run/execute counts without cross-merchant deletion', async () => {
    const old = new Date(Date.now() - 31 * 86_400_000);
    const [oldA, oldB] = await Promise.all([
      prisma.conversation.create({ data: { merchantId: merchantA, channel: 'web', externalUserId: 'admin-retention-a', updatedAt: old } }),
      prisma.conversation.create({ data: { merchantId: merchantB, channel: 'web', externalUserId: 'admin-retention-b', updatedAt: old } }),
    ]);
    await prisma.demandEvent.create({ data: { merchantId: merchantA, conversationId: oldA.id, intentKey: 'admin-retention-demand', occurredAt: old, channel: 'web', canonicalAttributes: {}, outcome: 'UNKNOWN', privacyVersion: 'v1' } });

    await expect(request(app.getHttpServer()).post('/api/admin/retention/demand').send({ dryRun: true, merchantId: merchantA })).resolves.toMatchObject({ status: 401 });
    const dryRun = await request(app.getHttpServer()).post('/api/admin/retention/demand').set('Authorization', authorization).set('x-request-id', 'retention-demand-request-001').send({ dryRun: true, merchantId: merchantA });
    expect(dryRun.status).toBe(201);
    expect(dryRun.body).toMatchObject({ dryRun: true, count: 1, deleted: 0 });
    await expect(prisma.demandEvent.count({ where: { merchantId: merchantA } })).resolves.toBe(1);

    const execute = await request(app.getHttpServer()).post('/api/admin/retention/conversations').set('Authorization', authorization).set('x-request-id', 'retention-conversations-request-001').send({ dryRun: false, merchantId: merchantA });
    expect(execute.status).toBe(201);
    expect(execute.body).toMatchObject({ dryRun: false, count: 1, deleted: 1 });
    await expect(prisma.conversation.findUnique({ where: { id: oldA.id } })).resolves.toBeNull();
    await expect(prisma.conversation.findUnique({ where: { id: oldB.id } })).resolves.toMatchObject({ id: oldB.id });
    const retentionAudits = await prisma.auditLog.findMany({ where: { action: { in: ['retention.demand.executed', 'retention.conversations.executed'] } } });
    expect(retentionAudits).toHaveLength(2);
    expect(retentionAudits.map(({ actorId, metadata }) => ({ actorId, metadata }))).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: expect.any(String), metadata: expect.objectContaining({ correlationId: 'retention-demand-request-001' }) }),
      expect.objectContaining({ actorId: expect.any(String), metadata: expect.objectContaining({ correlationId: 'retention-conversations-request-001' }) }),
    ]));
    expect(JSON.stringify(retentionAudits)).not.toContain('admin-retention-a');
    expect(JSON.stringify(retentionAudits)).not.toContain('rawPayload');
  });

  it('rejects disabled retention and executes registry-mediated retry attempts with safe audited outcomes', async () => {
    const previous = process.env.RETENTION_DAYS;
    process.env.RETENTION_DAYS = '0';
    await expect(request(app.getHttpServer()).post('/api/admin/retention/demand').set('Authorization', authorization).send({ dryRun: false })).resolves.toMatchObject({ status: 400 });
    process.env.RETENTION_DAYS = previous;

    const registry = app.get(ChannelRegistryService);
    const client = new FakeTelegramClient();
    registry.register(new TelegramAdapter(client, 'retention-telegram-secret'));
    const target = { merchantId: merchantA, externalUserId: 'safe-test-user', externalMessageId: 'safe-test-message', correlationId: 'retention-retry-correlation' };

    await expect(registry.retryDelivery({ channel: 'telegram', outbound: { text: 'do not audit this retry text' }, target, actorId })).resolves.toMatchObject({ ok: true });
    expect(client.deliveries).toHaveLength(1);

    client.failuresRemaining = 2;
    await expect(registry.retryDelivery({ channel: 'telegram', outbound: { text: 'also do not audit this' }, target: { ...target, correlationId: 'retention-retry-failure' }, actorId })).resolves.toEqual({ ok: false, errorCode: 'CHANNEL_DELIVERY_FAILED', retryable: true });
    expect(client.attempts).toBe(3);

    const retryAudits = await prisma.auditLog.findMany({ where: { action: 'channel.delivery_retried', targetId: { in: ['retention-retry-correlation', 'retention-retry-failure'] } }, orderBy: { targetId: 'asc' } });
    expect(retryAudits.map(({ actorId, metadata }) => ({ actorId, metadata }))).toEqual([
      { actorId, metadata: { merchantId: merchantA, channel: 'telegram', correlationId: 'retention-retry-correlation', outcome: 'delivered' } },
      { actorId, metadata: { merchantId: merchantA, channel: 'telegram', correlationId: 'retention-retry-failure', outcome: 'failed', errorCode: 'CHANNEL_DELIVERY_FAILED', retryable: true } },
    ]);
    expect(JSON.stringify(retryAudits)).not.toContain('rawPayload');
    expect(JSON.stringify(retryAudits)).not.toContain('do not audit this');
  });
});
