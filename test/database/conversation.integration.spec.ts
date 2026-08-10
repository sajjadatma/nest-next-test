import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { ConversationService } from '../../src/conversations/conversation.service';
import { NormalizedInboundMessage } from '../../src/conversations/conversation.types';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('ConversationService database integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let conversations: ConversationService;
  let merchantA: string;
  let merchantB: string;

  const inbound = (overrides: Partial<NormalizedInboundMessage> = {}): NormalizedInboundMessage => ({
    id: `clconversation${overrides.externalMessageId ?? 'message000001'}`,
    merchantId: merchantA,
    channel: 'telegram',
    externalMessageId: 'telegram-message-1',
    externalUserId: 'telegram-user-1',
    type: 'text',
    text: 'سلام',
    payload: { providerOnly: 'must-not-persist' },
    occurredAt: '2026-08-10T12:00:00.000Z',
    ...overrides,
  });

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const [firstMerchant, secondMerchant] = await Promise.all([
      prisma.merchant.create({ data: { slug: 'conversations-a', name: 'Conversations A' } }),
      prisma.merchant.create({ data: { slug: 'conversations-b', name: 'Conversations B' } }),
    ]);
    merchantA = firstMerchant.id;
    merchantB = secondMerchant.id;
    conversations = new ConversationService(prisma as unknown as PrismaService);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('persists one normalized inbound message and returns its existing conversation on replay', async () => {
    const first = await conversations.normalizeAndPersist(inbound());
    const replay = await conversations.normalizeAndPersist(inbound({ id: 'clconversationmessage000002', payload: { anotherRawField: true } }));

    expect(first.created).toBe(true);
    expect(replay).toMatchObject({ created: false, message: { id: first.message.id }, conversation: { id: first.conversation.id } });
    await expect(prisma.message.count()).resolves.toBe(1);
    await expect(prisma.conversation.count()).resolves.toBe(1);
    await expect(prisma.customer.count()).resolves.toBe(1);
  });

  it('resolves one merchant-scoped customer identity without profile merging', async () => {
    const first = await conversations.normalizeAndPersist(inbound({ externalMessageId: 'telegram-message-identity-1' }));
    const second = await conversations.normalizeAndPersist(inbound({ externalMessageId: 'telegram-message-identity-2' }));
    const otherMerchant = await conversations.normalizeAndPersist(inbound({ merchantId: merchantB, externalMessageId: 'telegram-message-identity-3' }));

    expect(second.conversation.customerId).toBe(first.conversation.customerId);
    expect(otherMerchant.conversation.customerId).not.toBe(first.conversation.customerId);
    await expect(prisma.customer.count({ where: { merchantId: merchantA } })).resolves.toBe(1);
    await expect(prisma.customer.count({ where: { merchantId: merchantB } })).resolves.toBe(1);
  });

  it('scopes conversation reads by merchant', async () => {
    const persisted = await conversations.normalizeAndPersist(inbound({ externalMessageId: 'telegram-message-isolation' }));

    await expect(conversations.findById(merchantA, persisted.conversation.id)).resolves.toMatchObject({ id: persisted.conversation.id, merchantId: merchantA });
    await expect(conversations.findById(merchantB, persisted.conversation.id)).resolves.toBeNull();
  });

  it('rejects malformed required normalized input deterministically', async () => {
    await expect(conversations.normalizeAndPersist({ ...inbound(), externalMessageId: '' })).rejects.toThrow('externalMessageId is required');
    await expect(conversations.normalizeAndPersist({ ...inbound(), channel: 'signal' as NormalizedInboundMessage['channel'] })).rejects.toThrow('channel is invalid');
    await expect(conversations.normalizeAndPersist({ ...inbound(), occurredAt: 'not-an-iso-date' })).rejects.toThrow('occurredAt must be a valid ISO-8601 UTC timestamp');
  });

  it('stores normalized fields only and has no raw provider payload column', async () => {
    const persisted = await conversations.normalizeAndPersist(inbound({ externalMessageId: 'telegram-message-privacy' }));
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Message'
    `;

    expect(persisted.message).toMatchObject({ text: 'سلام', externalMessageId: 'telegram-message-privacy' });
    expect(columns.map(({ column_name }) => column_name)).not.toContain('payload');
  });
});
