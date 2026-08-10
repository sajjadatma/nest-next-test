import { PrismaService } from '../prisma/prisma.service';
import { DemandAggregatesService } from './demand-aggregates.service';

describe('DemandAggregatesService', () => {
  it('returns deterministic exact totals, omits sub-threshold cells, and reports a threshold-gated trend', async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ category: 'shoes', count: BigInt(6) }, { category: 'bags', count: BigInt(2) }])
      .mockResolvedValueOnce([{ matched: BigInt(6), unmet: BigInt(2), outOfStock: BigInt(1), priceTooHigh: BigInt(1), volume: BigInt(8) }])
      // SQL applies threshold suppression before the service serializes rows.
      .mockResolvedValueOnce([{ attribute: 'color', value: 'white', count: BigInt(5) }])
      .mockResolvedValueOnce([{ value: '42', count: BigInt(5) }])
      .mockResolvedValueOnce([{ value: 'white', count: BigInt(5) }])
      .mockResolvedValueOnce([{ firstHalf: BigInt(2), secondHalf: BigInt(6), total: BigInt(8) }]);
    const service = new DemandAggregatesService({ $queryRaw: queryRaw } as unknown as PrismaService);

    await expect(service.summary({ merchantId: 'merchant-a', from: new Date('2026-08-01T00:00:00.000Z'), to: new Date('2026-08-10T00:00:00.000Z') })).resolves.toEqual({
      range: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-10T00:00:00.000Z' },
      volume: 8,
      volumeByCategory: [{ category: 'shoes', count: 6 }, { category: 'bags', count: 2 }],
      matched: 6,
      unmet: 2,
      outOfStock: 1,
      priceTooHigh: 1,
      topAttributes: [{ attribute: 'color', value: 'white', count: 5 }],
      topSizes: [{ value: '42', count: 5 }],
      topColors: [{ value: 'white', count: 5 }],
      trend: 'up',
    });
    expect(queryRaw).toHaveBeenCalledTimes(6);
  });

  it('uses the validated outcome filter for every aggregate and withholds trend below the privacy threshold', async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ matched: BigInt(0), unmet: BigInt(4), outOfStock: BigInt(4), priceTooHigh: BigInt(0) }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ firstHalf: BigInt(1), secondHalf: BigInt(3), total: BigInt(4) }]);
    const service = new DemandAggregatesService({ $queryRaw: queryRaw } as unknown as PrismaService);

    await expect(service.summary({ merchantId: 'merchant-a', from: new Date('2026-08-01T00:00:00.000Z'), to: new Date('2026-08-10T00:00:00.000Z'), outcome: 'out-of-stock' })).resolves.toMatchObject({
      matched: 0,
      unmet: 4,
      outOfStock: 4,
      trend: null,
      topAttributes: [],
      topSizes: [],
      topColors: [],
    });
  });
});
