import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { ConversationRetentionService } from '../../src/conversations/conversation-retention.service';
import { DemandRetentionService } from '../../src/demand/demand-retention.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('retention services database integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let merchantA: string;
  let merchantB: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    [merchantA, merchantB] = (await Promise.all([
      prisma.merchant.create({ data: { slug: 'retention-a', name: 'Retention A' } }),
      prisma.merchant.create({ data: { slug: 'retention-b', name: 'Retention B' } }),
    ])).map(({ id }) => id);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('projects and deletes only expired demand events in the requested merchant scope', async () => {
    const cutoff = new Date('2026-08-01T00:00:00.000Z');
    const [oldA, recentA, oldB] = await Promise.all([
      prisma.conversation.create({ data: { merchantId: merchantA, channel: 'web', externalUserId: 'retention-old-a', updatedAt: new Date('2026-07-01T00:00:00.000Z') } }),
      prisma.conversation.create({ data: { merchantId: merchantA, channel: 'web', externalUserId: 'retention-recent-a' } }),
      prisma.conversation.create({ data: { merchantId: merchantB, channel: 'web', externalUserId: 'retention-old-b', updatedAt: new Date('2026-07-01T00:00:00.000Z') } }),
    ]);
    await prisma.demandEvent.createMany({ data: [
      { merchantId: merchantA, conversationId: oldA.id, intentKey: 'old-a', occurredAt: new Date('2026-07-01T00:00:00.000Z'), channel: 'web', canonicalAttributes: {}, outcome: 'UNKNOWN', privacyVersion: 'v1' },
      { merchantId: merchantA, conversationId: recentA.id, intentKey: 'recent-a', occurredAt: new Date('2026-08-02T00:00:00.000Z'), channel: 'web', canonicalAttributes: {}, outcome: 'UNKNOWN', privacyVersion: 'v1' },
      { merchantId: merchantB, conversationId: oldB.id, intentKey: 'old-b', occurredAt: new Date('2026-07-01T00:00:00.000Z'), channel: 'web', canonicalAttributes: {}, outcome: 'UNKNOWN', privacyVersion: 'v1' },
    ] });
    const retention = new DemandRetentionService(prisma as unknown as PrismaService);

    await expect(retention.deleteDemandOlderThan({ cutoff, merchantId: merchantA, dryRun: true })).resolves.toEqual({ count: 1, deleted: 0 });
    await expect(prisma.demandEvent.count({ where: { merchantId: merchantA } })).resolves.toBe(2);
    await expect(retention.deleteDemandOlderThan({ cutoff, merchantId: merchantA, dryRun: false })).resolves.toEqual({ count: 1, deleted: 1 });
    await expect(prisma.demandEvent.count({ where: { merchantId: merchantA } })).resolves.toBe(1);
    await expect(prisma.demandEvent.count({ where: { merchantId: merchantB } })).resolves.toBe(1);
    await prisma.conversation.update({ where: { id: oldA.id }, data: { updatedAt: new Date('2026-08-02T00:00:00.000Z') } });
  });

  it('projects and deletes only expired conversations, and proves no raw provider payload column exists', async () => {
    const cutoff = new Date('2026-08-01T00:00:00.000Z');
    const [oldA, recentA, oldB] = await Promise.all([
      prisma.conversation.create({ data: { merchantId: merchantA, channel: 'telegram', externalUserId: 'conversation-old-a', updatedAt: new Date('2026-07-01T00:00:00.000Z') } }),
      prisma.conversation.create({ data: { merchantId: merchantA, channel: 'telegram', externalUserId: 'conversation-recent-a' } }),
      prisma.conversation.create({ data: { merchantId: merchantB, channel: 'telegram', externalUserId: 'conversation-old-b', updatedAt: new Date('2026-07-01T00:00:00.000Z') } }),
    ]);
    const retention = new ConversationRetentionService(prisma as unknown as PrismaService);
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('DemandEvent', 'Message')`;

    await expect(retention.deleteConversationsOlderThan({ cutoff, merchantId: merchantA, dryRun: true })).resolves.toEqual({ count: 1, deleted: 0 });
    await expect(retention.deleteConversationsOlderThan({ cutoff, merchantId: merchantA, dryRun: false })).resolves.toEqual({ count: 1, deleted: 1 });
    await expect(prisma.conversation.findUnique({ where: { id: oldA.id } })).resolves.toBeNull();
    await expect(prisma.conversation.findUnique({ where: { id: recentA.id } })).resolves.toMatchObject({ id: recentA.id });
    await expect(prisma.conversation.findUnique({ where: { id: oldB.id } })).resolves.toMatchObject({ id: oldB.id });
    expect(columns.map(({ column_name }) => column_name)).not.toEqual(expect.arrayContaining(['rawPayload', 'payload', 'providerPayload']));
    await expect(new DemandRetentionService(prisma as unknown as PrismaService).purgeUnlinkedRawData()).resolves.toEqual({ count: 0, deleted: 0 });
  });
});
