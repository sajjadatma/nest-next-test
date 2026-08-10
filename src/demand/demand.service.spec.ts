import { ConflictException } from '@nestjs/common';
import { type StructuredIntent } from '../ai/contracts/intent.contracts';
import { PrismaService } from '../prisma/prisma.service';
import { DemandService, type RecordDemandInput } from './demand.service';

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

const demand = (overrides: Partial<RecordDemandInput> = {}): RecordDemandInput => ({
  merchantId: 'merchant-a',
  conversationId: 'conversation-a',
  channel: 'web',
  occurredAt: '2026-08-10T12:00:00.000Z',
  intent,
  outcome: { merchantId: 'merchant-a', conversationId: 'conversation-a', kind: 'MATCHED', confidence: 0.9 },
  ...overrides,
});

describe('DemandService', () => {
  const prisma = {
    demandEvent: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const service = new DemandService(prisma as unknown as PrismaService);

  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['UNKNOWN', 'MATCHED'],
    ['UNKNOWN', 'NO_MATCH'],
    ['UNKNOWN', 'OUT_OF_STOCK'],
    ['UNKNOWN', 'PRICE_TOO_HIGH'],
    ['UNKNOWN', 'VARIANT_UNAVAILABLE'],
    ['UNKNOWN', 'HANDED_OFF'],
    ['MATCHED', 'MATCHED_NOT_PURCHASED'],
    ['MATCHED', 'PURCHASED'],
    ['MATCHED', 'ABANDONED'],
    ['MATCHED', 'HANDED_OFF'],
  ])('allows %s -> %s', async (from, to) => {
    prisma.demandEvent.findUnique.mockResolvedValue({ id: 'event-1', outcome: from });
    prisma.demandEvent.update.mockResolvedValue({ id: 'event-1', outcome: to });

    await expect(service.recordOrUpdateDemand(demand({ outcome: { merchantId: 'merchant-a', conversationId: 'conversation-a', kind: to as RecordDemandInput['outcome']['kind'], confidence: 0.9 } }))).resolves.toMatchObject({ outcome: to });
    expect(prisma.demandEvent.update).toHaveBeenCalledWith({ where: { id: 'event-1' }, data: { outcome: to, failureReason: undefined } });
  });

  it('rejects terminal and cross-branch transitions', async () => {
    prisma.demandEvent.findUnique.mockResolvedValue({ id: 'event-1', outcome: 'NO_MATCH' });

    await expect(service.recordOrUpdateDemand(demand({ outcome: { merchantId: 'merchant-a', conversationId: 'conversation-a', kind: 'PURCHASED', confidence: 0.9 } }))).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.demandEvent.update).not.toHaveBeenCalled();
  });

  it('does not update an idempotent replay and scopes merchant queries', async () => {
    prisma.demandEvent.findUnique.mockResolvedValue({ id: 'event-1', outcome: 'MATCHED' });

    await expect(service.recordOrUpdateDemand(demand())).resolves.toMatchObject({ id: 'event-1', outcome: 'MATCHED' });
    await service.eventsForMerchant('merchant-a');
    await service.eventForMerchant('merchant-a', 'event-1');

    expect(prisma.demandEvent.create).not.toHaveBeenCalled();
    expect(prisma.demandEvent.update).not.toHaveBeenCalled();
    expect(prisma.demandEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { merchantId: 'merchant-a' } }));
    expect(prisma.demandEvent.findFirst).toHaveBeenCalledWith({ where: { id: 'event-1', merchantId: 'merchant-a' } });
  });

  it('creates a privacy-safe event with deterministic intent key and rejects PII attributes', async () => {
    prisma.demandEvent.findUnique.mockResolvedValue(null);
    prisma.demandEvent.create.mockResolvedValue({ id: 'event-1', outcome: 'MATCHED' });

    await service.recordOrUpdateDemand(demand());

    expect(prisma.demandEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        merchantId: 'merchant-a',
        conversationId: 'conversation-a',
        canonicalAttributes: { color: 'white' },
        privacyVersion: 'v1',
        intentKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
    await expect(service.recordOrUpdateDemand(demand({ intent: { ...intent, attributes: { email: 'customer@example.com' } } }))).rejects.toThrow('privacy-safe');
  });
});
