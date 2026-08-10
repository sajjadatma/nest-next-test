import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { type StructuredIntent } from '../../src/ai/contracts/intent.contracts';
import { DemandService } from '../../src/demand/demand.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const intent: StructuredIntent = {
  intent: 'product_search',
  category: 'shoes',
  attributes: { color: 'white' },
  size: '42',
  budgetMin: 1000,
  budgetMax: 2000,
  currency: 'USD',
  purchaseIntent: 'high',
  confidence: 0.9,
  missingInformation: [],
};

describe('DemandService database integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let demand: DemandService;
  let merchantA: string;
  let merchantB: string;
  let conversationA: string;

  const record = (overrides: Partial<Parameters<DemandService['recordOrUpdateDemand']>[0]> = {}) => ({
    merchantId: merchantA,
    conversationId: conversationA,
    channel: 'telegram' as const,
    occurredAt: '2026-08-10T12:00:00.000Z',
    intent,
    outcome: { merchantId: merchantA, conversationId: conversationA, kind: 'MATCHED' as const, confidence: 0.9 },
    ...overrides,
  });

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const [firstMerchant, secondMerchant] = await Promise.all([
      prisma.merchant.create({ data: { slug: 'demand-a', name: 'Demand A' } }),
      prisma.merchant.create({ data: { slug: 'demand-b', name: 'Demand B' } }),
    ]);
    merchantA = firstMerchant.id;
    merchantB = secondMerchant.id;
    const conversation = await prisma.conversation.create({ data: { merchantId: merchantA, channel: 'telegram', externalUserId: 'demand-customer-a' } });
    conversationA = conversation.id;
    demand = new DemandService(prisma as unknown as PrismaService);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('persists one normalized, idempotent demand event and reads its transition back', async () => {
    const created = await demand.recordOrUpdateDemand(record());
    const replay = await demand.recordOrUpdateDemand(record());
    const persisted = await prisma.demandEvent.findUniqueOrThrow({ where: { id: created.id } });

    expect(replay.id).toBe(created.id);
    expect(await prisma.demandEvent.count({ where: { merchantId: merchantA, conversationId: conversationA } })).toBe(1);
    expect(persisted).toMatchObject({
      merchantId: merchantA,
      conversationId: conversationA,
      channel: 'telegram',
      category: 'shoes',
      canonicalAttributes: { color: 'white' },
      size: '42',
      budgetMin: 1000,
      budgetMax: 2000,
      currency: 'USD',
      outcome: 'MATCHED',
      privacyVersion: 'v1',
    });

    const pendingConversation = await prisma.conversation.create({ data: { merchantId: merchantA, channel: 'web', externalUserId: 'demand-customer-transition' } });
    const unknown = await demand.recordOrUpdateDemand(record({ conversationId: pendingConversation.id, channel: 'web', outcome: { merchantId: merchantA, conversationId: pendingConversation.id, kind: 'UNKNOWN', confidence: 0.9 } }));
    const matched = await demand.recordOrUpdateDemand(record({ conversationId: pendingConversation.id, channel: 'web', outcome: { merchantId: merchantA, conversationId: pendingConversation.id, kind: 'MATCHED', confidence: 0.9 } }));
    const purchased = await demand.recordOrUpdateDemand(record({ conversationId: pendingConversation.id, channel: 'web', outcome: { merchantId: merchantA, conversationId: pendingConversation.id, kind: 'PURCHASED', confidence: 0.9 } }));
    expect(unknown.id).toBe(matched.id);
    expect(matched.id).toBe(purchased.id);
    await expect(prisma.demandEvent.findUniqueOrThrow({ where: { id: purchased.id } })).resolves.toMatchObject({ outcome: 'PURCHASED' });
  });

  it('enforces merchant isolation and stores no direct identity or raw message data', async () => {
    const event = await prisma.demandEvent.findFirstOrThrow({ where: { merchantId: merchantA } });
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'DemandEvent'
    `;

    await expect(demand.eventsForMerchant(merchantB)).resolves.toEqual([]);
    await expect(demand.eventForMerchant(merchantB, event.id)).resolves.toBeNull();
    expect(columns.map(({ column_name }) => column_name)).not.toEqual(expect.arrayContaining([
      'customerId', 'externalUserId', 'phone', 'email', 'handle', 'text', 'rawPayload', 'payload',
    ]));
    expect(JSON.stringify(event)).not.toContain('demand-customer-a');
    expect(JSON.stringify(event)).not.toContain('customer@example.com');
  });

  it('retains a privacy-safe demand record when a linked customer is deleted', async () => {
    const customer = await prisma.customer.create({ data: { merchantId: merchantA } });
    const conversation = await prisma.conversation.create({ data: { merchantId: merchantA, customerId: customer.id, channel: 'whatsapp', externalUserId: 'demand-customer-delete' } });
    const event = await demand.recordOrUpdateDemand(record({
      conversationId: conversation.id,
      channel: 'whatsapp',
      outcome: { merchantId: merchantA, conversationId: conversation.id, kind: 'NO_MATCH', confidence: 0.9 },
    }));

    await prisma.customer.delete({ where: { id: customer.id } });

    await expect(prisma.demandEvent.findUniqueOrThrow({ where: { id: event.id } })).resolves.toMatchObject({ id: event.id, merchantId: merchantA, outcome: 'NO_MATCH' });
    await expect(prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).resolves.toMatchObject({ customerId: null });
  });
});
