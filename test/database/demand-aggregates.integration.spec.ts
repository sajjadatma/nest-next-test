import { execFileSync } from 'node:child_process';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

const from = '2026-08-01T00:00:00.000Z';
const to = '2026-08-10T00:00:00.000Z';

describe('Demand aggregates database integration', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let merchantA: string;
  let merchantB: string;
  let authorized: string;
  let forbidden: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'demand-aggregate-test-secret-that-is-longer-than-32-characters';
    process.env.ADMIN_EMAILS = '';
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const [a, b] = await Promise.all([
      prisma.merchant.create({ data: { slug: 'demand-aggregate-a', name: 'Demand Aggregate A' } }),
      prisma.merchant.create({ data: { slug: 'demand-aggregate-b', name: 'Demand Aggregate B' } }),
    ]);
    merchantA = a.id;
    merchantB = b.id;
    await seedEvents(merchantA, [
      ...Array.from({ length: 5 }, (_, index) => ({ category: 'shoes', outcome: 'MATCHED' as const, color: 'white', size: '42', occurredAt: index < 2 ? '2026-08-02T12:00:00.000Z' : '2026-08-08T12:00:00.000Z' })),
      { category: 'shoes', outcome: 'MATCHED' as const, color: 'blue', size: '41', occurredAt: '2026-08-08T12:00:00.000Z' },
      { category: 'bags', outcome: 'OUT_OF_STOCK' as const, color: 'red', size: 'M', occurredAt: '2026-08-08T12:00:00.000Z' },
      { category: 'bags', outcome: 'OUT_OF_STOCK' as const, color: 'red', size: 'M', occurredAt: '2026-08-08T12:00:00.000Z' },
      { category: 'bags', outcome: 'VARIANT_UNAVAILABLE' as const, color: 'red', size: 'M', occurredAt: '2026-08-08T12:00:00.000Z' },
      { category: 'bags', outcome: 'PRICE_TOO_HIGH' as const, color: 'red', size: 'M', occurredAt: '2026-08-08T12:00:00.000Z' },
    ]);
    await seedEvents(merchantB, [{ category: 'private', outcome: 'MATCHED' as const, color: 'private', size: 'X', occurredAt: '2026-08-08T12:00:00.000Z' }]);

    const allowedRegistration = await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'demand-allowed@example.test', password: 'password123' });
    const forbiddenRegistration = await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'demand-forbidden@example.test', password: 'password123' });
    if (allowedRegistration.status !== 201 || forbiddenRegistration.status !== 201) {
      throw new Error(`registration failed: allowed=${allowedRegistration.status} ${JSON.stringify(allowedRegistration.body)}, forbidden=${forbiddenRegistration.status} ${JSON.stringify(forbiddenRegistration.body)}`);
    }
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'demand:read' } });
    await prisma.userPermission.create({ data: { userId: allowedRegistration.body.user.id, permissionId: permission.id } });
    await prisma.merchantMembership.create({ data: { merchantId: merchantA, userId: allowedRegistration.body.user.id } });
    authorized = `Bearer ${allowedRegistration.body.accessToken}`;
    forbidden = `Bearer ${forbiddenRegistration.body.accessToken}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('returns fixture-derived exact merchant-scoped totals and omits cells below the threshold', async () => {
    const response = await request(app.getHttpServer()).get(`/api/demand/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).set('x-merchant-id', merchantA).set('Authorization', authorized);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      range: { from, to },
      volume: 10,
      volumeByCategory: [{ category: 'shoes', count: 6 }, { category: 'bags', count: 4 }],
      matched: 6,
      unmet: 4,
      outOfStock: 3,
      priceTooHigh: 1,
      topAttributes: [{ attribute: 'color', value: 'white', count: 5 }],
      topSizes: [{ value: '42', count: 5 }],
      topColors: [{ value: 'white', count: 5 }],
      trend: 'up',
    });
    expect(JSON.stringify(response.body)).not.toContain('demand-aggregate-a');
  });

  it('validates ranges and outcomes, applies outcome filters, requires demand:read, and denies another merchant', async () => {
    const outOfStock = await request(app.getHttpServer()).get(`/api/demand/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&outcome=out-of-stock`).set('x-merchant-id', merchantA).set('Authorization', authorized);
    const invalidRange = await request(app.getHttpServer()).get(`/api/demand/summary?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`).set('x-merchant-id', merchantA).set('Authorization', authorized);
    const invalidOutcome = await request(app.getHttpServer()).get(`/api/demand/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&outcome=wrong`).set('x-merchant-id', merchantA).set('Authorization', authorized);
    const noPermission = await request(app.getHttpServer()).get(`/api/demand/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).set('x-merchant-id', merchantA).set('Authorization', forbidden);
    const otherMerchant = await request(app.getHttpServer()).get(`/api/demand/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).set('x-merchant-id', merchantB).set('Authorization', authorized);

    expect(outOfStock).toMatchObject({ status: 200, body: expect.objectContaining({ matched: 0, unmet: 3, outOfStock: 3, priceTooHigh: 0, volumeByCategory: [{ category: 'bags', count: 3 }] }) });
    expect(invalidRange.status).toBe(400);
    expect(invalidOutcome.status).toBe(400);
    expect(noPermission.status).toBe(403);
    expect(otherMerchant.status).toBe(404);
  });

  async function seedEvents(merchantId: string, events: Array<{ category: string; outcome: 'MATCHED' | 'OUT_OF_STOCK' | 'VARIANT_UNAVAILABLE' | 'PRICE_TOO_HIGH'; color: string; size: string; occurredAt: string }>) {
    for (const [index, event] of events.entries()) {
      const conversation = await prisma.conversation.create({ data: { merchantId, channel: 'web', externalUserId: `${merchantId}-demand-${index}` } });
      await prisma.demandEvent.create({ data: {
        merchantId,
        conversationId: conversation.id,
        intentKey: `${merchantId}-intent-${index}`,
        occurredAt: new Date(event.occurredAt),
        channel: 'web',
        category: event.category,
        canonicalAttributes: { color: event.color },
        size: event.size,
        outcome: event.outcome,
        privacyVersion: 'v1',
      } });
    }
  }
});
