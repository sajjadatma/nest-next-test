import { BadRequestException, ConflictException } from '@nestjs/common';
import { B2bService } from './b2b.service';

const prismaStub = () => ({
  productVariant: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  product: { findUnique: vi.fn() },
  company: { findUnique: vi.fn() },
  companyMembership: { findFirst: vi.fn(), findMany: vi.fn() },
  customerGroup: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  priceList: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  priceListItem: { findUnique: vi.fn(), upsert: vi.fn() },
  priceTier: { upsert: vi.fn() },
});

describe('B2bService', () => {
  it('normalizes SKU deterministically and rejects unsafe characters', () => {
    const service = new B2bService(prismaStub() as any);
    expect(service.normalizeSku('  acme 100 red ')).toBe('ACME-100-RED');
    expect(() => service.normalizeSku('acme/100')).toThrow(BadRequestException);
  });

  it('rejects a quantity increment that cannot satisfy the minimum', async () => {
    const db = prismaStub(); db.productVariant.findUnique.mockResolvedValue({ id: 'v1' });
    const service = new B2bService(db as any);
    await expect(service.updateVariant('v1', { sku: 'SKU-1', name: 'Variant', basePriceMinor: 100, stockQty: 10, lowStockThreshold: 1, minimumOrderQty: 3, packSize: 1, quantityIncrement: 2 } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.productVariant.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate variant SKUs as a conflict', async () => {
    const db = prismaStub(); db.product.findUnique.mockResolvedValue({ id: 'p1', currency: 'USD' }); db.productVariant.create.mockRejectedValue({ code: 'P2002' });
    const service = new B2bService(db as any);
    await expect(service.createVariant('p1', { sku: 'SKU-1', name: 'Variant', basePriceMinor: 100, stockQty: 10, lowStockThreshold: 1, minimumOrderQty: 1, packSize: 1, quantityIncrement: 1 } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('selects the highest quantity tier and applies the variant fallback when no list matches', async () => {
    const db = prismaStub();
    db.company.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', customerGroupId: 'g1', customerGroup: { id: 'g1' } });
    db.companyMembership.findFirst.mockResolvedValue({ id: 'm1', status: 'ACTIVE' });
    db.productVariant.findUnique.mockResolvedValue({ id: 'v1', sku: 'SKU-1', name: 'Variant', basePriceMinor: 100, currency: 'USD', minimumOrderQty: 1, packSize: 1, quantityIncrement: 1, stockQty: 50, product: { id: 'p1', name: 'Product' } });
    db.priceList.findMany.mockResolvedValue([{ id: 'list-1', priority: 2, createdAt: new Date('2024-01-01'), items: [{ id: 'item-1', priceMinor: 90, tiers: [{ id: 'tier-1', minimumQuantity: 10, unitPriceMinor: 70 }, { id: 'tier-2', minimumQuantity: 5, unitPriceMinor: 80 }] }] }]);
    const service = new B2bService(db as any);
    await expect(service.price('c1', 'u1', 'v1', 10)).resolves.toMatchObject({ unitPriceMinor: 70, source: 'tier' });
    db.priceList.findMany.mockResolvedValue([]);
    await expect(service.price('c1', 'u1', 'v1', 1)).resolves.toMatchObject({ unitPriceMinor: 100, source: 'variant' });
  });
});
