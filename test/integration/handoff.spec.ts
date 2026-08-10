import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('handoff HTTP integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let merchantA: string;
  let merchantB: string;
  let conversationId: string;
  let operatorAuthorization: string;
  let readOnlyAuthorization: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const [firstMerchant, secondMerchant] = await Promise.all([
      prisma.merchant.create({ data: { slug: `handoff-http-a-${randomUUID()}`, name: 'Handoff HTTP A' } }),
      prisma.merchant.create({ data: { slug: `handoff-http-b-${randomUUID()}`, name: 'Handoff HTTP B' } }),
    ]);
    merchantA = firstMerchant.id;
    merchantB = secondMerchant.id;
    conversationId = (await prisma.conversation.create({ data: { merchantId: merchantA, channel: 'web', externalUserId: `handoff-http-${randomUUID()}` } })).id;
    const [operator, readOnly] = await Promise.all([
      request(app.getHttpServer()).post('/api/auth/register').send({ email: `handoff-operator-${randomUUID()}@example.com`, password: 'password123' }),
      request(app.getHttpServer()).post('/api/auth/register').send({ email: `handoff-readonly-${randomUUID()}@example.com`, password: 'password123' }),
    ]);
    const [read, takeover] = await prisma.permission.findMany({ where: { key: { in: ['conversations:read', 'conversations:takeover'] } } });
    await prisma.userPermission.createMany({ data: [{ userId: operator.body.user.id, permissionId: read.id }, { userId: operator.body.user.id, permissionId: takeover.id }] });
    await prisma.userPermission.create({ data: { userId: readOnly.body.user.id, permissionId: read.id } });
    await prisma.merchantMembership.createMany({ data: [{ merchantId: merchantA, userId: operator.body.user.id }, { merchantId: merchantA, userId: readOnly.body.user.id }] });
    operatorAuthorization = `Bearer ${operator.body.accessToken}`;
    readOnlyAuthorization = `Bearer ${readOnly.body.accessToken}`;
  });

  afterAll(async () => app.close());

  it('returns 403 without takeover permission, 404 across merchants, and persists the accepted/released transitions', async () => {
    await prisma.humanHandoff.create({ data: { merchantId: merchantA, conversationId, reasonCode: 'HANDOFF_REQUIRED', summary: { intent: 'handoff', products: [], unresolvedIssue: { reasonCode: 'HANDOFF_REQUIRED' } } } });
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'HANDOFF_REQUESTED' } });

    const forbidden = await request(app.getHttpServer()).post(`/api/conversations/${conversationId}/handoff/accept`).set('x-merchant-id', merchantA).set('Authorization', readOnlyAuthorization);
    expect(forbidden.status).toBe(403);
    const crossMerchant = await request(app.getHttpServer()).get('/api/conversations/handoffs').set('x-merchant-id', merchantB).set('Authorization', operatorAuthorization);
    expect(crossMerchant.status).toBe(404);

    const accepted = await request(app.getHttpServer()).post(`/api/conversations/${conversationId}/handoff/accept`).set('x-merchant-id', merchantA).set('Authorization', operatorAuthorization);
    expect(accepted.status).toBe(201);
    const released = await request(app.getHttpServer()).post(`/api/conversations/${conversationId}/handoff/release`).set('x-merchant-id', merchantA).set('Authorization', operatorAuthorization);
    expect(released.status).toBe(201);
    const list = await request(app.getHttpServer()).get('/api/conversations/handoffs').set('x-merchant-id', merchantA).set('Authorization', readOnlyAuthorization);
    expect(list.status).toBe(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ conversationId, status: 'RESOLVED' })]));
    await expect(prisma.auditLog.findMany({ where: { targetId: conversationId, action: { in: ['conversation.handoff_accepted', 'conversation.handoff_released'] } } })).resolves.toHaveLength(2);
  });

  it('creates an automatic handoff and refuses autonomous tools until release', async () => {
    const externalUserId = `handoff-agent-${randomUUID()}`;
    const handoff = await request(app.getHttpServer())
      .post('/api/conversations/messages')
      .set('x-merchant-id', merchantA)
      .set('x-web-user-id', externalUserId)
      .send({ text: 'I need a refund now.', externalMessageId: `handoff-request-${randomUUID()}` });

    expect(handoff.status).toBe(201);
    expect(handoff.body.reply).toMatchObject({ kind: 'human_handoff' });
    await expect(prisma.conversation.findUniqueOrThrow({ where: { id: handoff.body.conversationId } })).resolves.toMatchObject({ status: 'HANDOFF_REQUESTED', owner: 'AI' });
    await expect(prisma.humanHandoff.findFirstOrThrow({ where: { conversationId: handoff.body.conversationId } })).resolves.toMatchObject({ reasonCode: 'HANDOFF_REQUIRED' });

    const blocked = await request(app.getHttpServer())
      .post('/api/conversations/messages')
      .set('x-merchant-id', merchantA)
      .set('x-web-user-id', externalUserId)
      .send({ text: 'show me running shoes', externalMessageId: `handoff-blocked-${randomUUID()}` });

    expect(blocked.status).toBe(201);
    expect(blocked.body.reply).toMatchObject({ kind: 'human_handoff', text: expect.stringContaining('currently being handled') });
    await expect(prisma.humanHandoff.count({ where: { conversationId: handoff.body.conversationId } })).resolves.toBe(1);

    await expect(request(app.getHttpServer()).post(`/api/conversations/${handoff.body.conversationId}/handoff/accept`).set('x-merchant-id', merchantA).set('Authorization', operatorAuthorization)).resolves.toMatchObject({ status: 201 });
    await expect(request(app.getHttpServer()).post(`/api/conversations/${handoff.body.conversationId}/handoff/release`).set('x-merchant-id', merchantA).set('Authorization', operatorAuthorization)).resolves.toMatchObject({ status: 201 });
    const resumed = await request(app.getHttpServer())
      .post('/api/conversations/messages')
      .set('x-merchant-id', merchantA)
      .set('x-web-user-id', externalUserId)
      .send({ text: 'show me running shoes', externalMessageId: `handoff-resumed-${randomUUID()}` });
    expect(resumed.status).toBe(201);
    expect(resumed.body.reply.kind).not.toBe('human_handoff');
  });
});
