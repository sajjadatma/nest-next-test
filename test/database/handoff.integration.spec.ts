import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { HandoffService } from '../../src/conversations/handoff.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('HandoffService database integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let handoffs: HandoffService;
  let merchantA: string;
  let merchantB: string;
  let conversationId: string;
  let operatorA: string;
  let operatorB: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const [firstMerchant, secondMerchant, firstOperator, secondOperator] = await Promise.all([
      prisma.merchant.create({ data: { slug: 'handoff-a', name: 'Handoff A' } }),
      prisma.merchant.create({ data: { slug: 'handoff-b', name: 'Handoff B' } }),
      prisma.user.create({ data: { email: 'handoff-operator-a@example.com', passwordHash: 'hash' } }),
      prisma.user.create({ data: { email: 'handoff-operator-b@example.com', passwordHash: 'hash' } }),
    ]);
    merchantA = firstMerchant.id;
    merchantB = secondMerchant.id;
    operatorA = firstOperator.id;
    operatorB = secondOperator.id;
    await prisma.merchantMembership.createMany({ data: [{ merchantId: merchantA, userId: operatorA }, { merchantId: merchantA, userId: operatorB }] });
    const category = await prisma.category.create({ data: { name: 'Handoff shoes', slug: 'handoff-shoes' } });
    const product = await prisma.product.create({
      data: {
        merchantId: merchantA,
        name: 'Verified Runner',
        slug: 'verified-runner',
        description: 'A verified product',
        priceMinor: 1200,
        stockQty: 2,
        categoryId: category.id,
      },
    });
    const conversation = await prisma.conversation.create({ data: { merchantId: merchantA, channel: 'web', externalUserId: 'handoff-customer' } });
    conversationId = conversation.id;
    await prisma.message.create({
      data: {
        id: 'handoff-message-1',
        merchantId: merchantA,
        conversationId,
        channel: 'web',
        externalMessageId: 'handoff-message-1',
        direction: 'INBOUND',
        type: 'text',
        text: 'My email is customer@example.com and I need a refund.',
        intent: { intent: 'handoff', confidence: 1, missingInformation: [], referenceProductIds: [product.id] },
        occurredAt: new Date(),
      },
    });
    handoffs = new HandoffService(prisma as unknown as PrismaService);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('creates a verified, PII-safe handoff and atomically advances to a single human owner', async () => {
    const requested = await handoffs.requestHandoff({ merchantId: merchantA, conversationId, reasonCode: 'HANDOFF_REQUIRED' });
    const requestReadback = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });

    expect(requested).toMatchObject({ merchantId: merchantA, conversationId, status: 'REQUESTED', summary: { intent: 'handoff', products: [{ name: 'Verified Runner' }], unresolvedIssue: { reasonCode: 'HANDOFF_REQUIRED' } } });
    expect(JSON.stringify(requested.summary)).not.toContain('customer@example.com');
    expect(requestReadback).toMatchObject({ status: 'HANDOFF_REQUESTED', owner: 'AI' });

    const accepted = await Promise.allSettled([
      handoffs.acceptHandoff({ merchantId: merchantA, conversationId, actorId: operatorA }),
      handoffs.acceptHandoff({ merchantId: merchantA, conversationId, actorId: operatorB }),
    ]);
    expect(accepted.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(accepted.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).resolves.toMatchObject({ status: 'HUMAN_ACTIVE', owner: 'HUMAN' });

    const handoff = await prisma.humanHandoff.findFirstOrThrow({ where: { conversationId } });
    const winningOperator = handoff.acceptedById!;
    await expect(handoffs.releaseToAi({ merchantId: merchantA, conversationId, actorId: winningOperator })).resolves.toMatchObject({ status: 'RESOLVED', resolvedAt: expect.any(Date) });
    await expect(prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).resolves.toMatchObject({ status: 'ACTIVE', owner: 'AI' });
    await expect(prisma.auditLog.findMany({ where: { targetId: conversationId, action: { in: ['conversation.handoff_requested', 'conversation.handoff_accepted', 'conversation.handoff_released'] } }, select: { action: true } })).resolves.toHaveLength(3);
  });

  it('hides cross-merchant handoffs and records an explicit resolve transition', async () => {
    const secondConversation = await prisma.conversation.create({ data: { merchantId: merchantA, channel: 'telegram', externalUserId: 'handoff-customer-2' } });
    await handoffs.requestHandoff({ merchantId: merchantA, conversationId: secondConversation.id, reasonCode: 'LOW_CONFIDENCE' });

    await expect(handoffs.handoffsForMerchant(merchantB)).resolves.toEqual([]);
    await expect(handoffs.acceptHandoff({ merchantId: merchantB, conversationId: secondConversation.id, actorId: operatorA })).rejects.toThrow('merchant was not found for this user');

    await handoffs.acceptHandoff({ merchantId: merchantA, conversationId: secondConversation.id, actorId: operatorA });
    await expect(handoffs.resolveHandoff({ merchantId: merchantA, conversationId: secondConversation.id, actorId: operatorA })).resolves.toMatchObject({ status: 'RESOLVED' });
    await expect(prisma.conversation.findUniqueOrThrow({ where: { id: secondConversation.id } })).resolves.toMatchObject({ status: 'CLOSED', owner: 'HUMAN' });
    await expect(prisma.auditLog.findFirstOrThrow({ where: { targetId: secondConversation.id, action: 'conversation.handoff_resolved' } })).resolves.toMatchObject({ actorId: operatorA });
  });
});
