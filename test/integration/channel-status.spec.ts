import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('channel status HTTP integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let merchantId: string;
  let authorized: string;
  let unauthorized: string;

  beforeAll(async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    merchantId = (await prisma.merchant.create({ data: { slug: `channel-status-${randomUUID()}`, name: 'Channel Status Merchant' } })).id;
    const [operator, noPermission] = await Promise.all([
      request(app.getHttpServer()).post('/api/auth/register').send({ email: `channel-status-operator-${randomUUID()}@example.com`, password: 'password123' }),
      request(app.getHttpServer()).post('/api/auth/register').send({ email: `channel-status-denied-${randomUUID()}@example.com`, password: 'password123' }),
    ]);
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'channels:read' } });
    await prisma.userPermission.create({ data: { userId: operator.body.user.id, permissionId: permission.id } });
    authorized = `Bearer ${operator.body.accessToken}`;
    unauthorized = `Bearer ${noPermission.body.accessToken}`;
  });

  afterAll(async () => app?.close());

  it('returns HTTP 200 with safe unconfigured Telegram status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/channels/status')
      .set('x-merchant-id', merchantId)
      .set('Authorization', authorized);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{
      id: 'telegram',
      label: 'Telegram',
      configured: false,
      healthy: false,
      lastEventAt: null,
      error: 'Channel is not configured',
    }]);
    expect(JSON.stringify(response.body)).not.toContain('TELEGRAM_BOT_TOKEN');
  });

  it('returns HTTP 403 without channels:read', async () => {
    await expect(request(app.getHttpServer())
      .get('/api/channels/status')
      .set('x-merchant-id', merchantId)
      .set('Authorization', unauthorized)).resolves.toMatchObject({ status: 403 });
  });

  it('returns HTTP 400 when x-merchant-id is missing', async () => {
    await expect(request(app.getHttpServer())
      .get('/api/channels/status')
      .set('Authorization', authorized)).resolves.toMatchObject({ status: 400 });
  });
});
