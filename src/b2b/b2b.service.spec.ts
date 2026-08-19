import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
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
  b2bCart: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn() },
  b2bCartLine: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  companyAddress: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  b2bPurchaseRequest: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  b2bOrder: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
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

  it('uses the Prisma B2B field names when persisting variants and tiers', async () => {
    const db = prismaStub();
    db.product.findUnique.mockResolvedValue({ id: 'p1', currency: 'USD' });
    db.productVariant.create.mockResolvedValue({ id: 'v1' });
    db.priceList.findUnique.mockResolvedValue({ id: 'list-1' });
    db.priceListItem.findUnique.mockResolvedValue({ id: 'item-1' });
    db.priceTier.upsert.mockResolvedValue({ id: 'tier-1' });
    const service = new B2bService(db as any);

    await service.createVariant('p1', { sku: 'sku-1', name: 'Variant', basePriceMinor: 125, stockQty: 4, lowStockThreshold: 1, minimumOrderQty: 1, packSize: 1, quantityIncrement: 1 } as any);
    expect(db.productVariant.create.mock.calls[0][0].data).toMatchObject({ basePriceMinor: 125 });
    expect(db.productVariant.create.mock.calls[0][0].data).not.toHaveProperty('priceMinor');

    await service.savePriceTier({ priceListItemId: 'item-1', minimumQuantity: 10, unitPriceMinor: 90 });
    expect(db.priceTier.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { priceListItemId_minimumQuantity: { priceListItemId: 'item-1', minimumQuantity: 10 } },
      update: { unitPriceMinor: 90 },
      create: { priceListItemId: 'item-1', minimumQuantity: 10, unitPriceMinor: 90 },
    }));
  });

  it('increments a duplicate cart line in the scoped company and currency cart', async () => {
    const db = prismaStub();
    const variant = { id: 'v1', sku: 'SKU-1', name: 'Variant', basePriceMinor: 100, currency: 'USD', isActive: true, minimumOrderQty: 1, packSize: 1, quantityIncrement: 1, stockQty: 50, product: { id: 'p1', name: 'Product', isActive: true } };
    const cart = { id: 'cart-1', companyId: 'c1', userId: 'u1', currency: 'EUR', lines: [{ id: 'line-1', variantId: 'v1', quantity: 5, variant }], updatedAt: new Date('2026-08-20T12:00:00Z') };
    db.company.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', customerGroupId: 'g1', customerGroup: { id: 'g1', currency: 'USD' } });
    db.companyMembership.findFirst.mockResolvedValue({ id: 'm1', status: 'ACTIVE', role: 'BUYER' });
    db.productVariant.findUnique.mockResolvedValue(variant);
    db.b2bCart.findUnique.mockResolvedValue(cart);
    db.b2bCartLine.findUnique.mockResolvedValue({ id: 'line-1', cartId: 'cart-1', variantId: 'v1', quantity: 5 });
    db.b2bCartLine.upsert.mockResolvedValue({ id: 'line-1', cartId: 'cart-1', variantId: 'v1', quantity: 5 });
    db.priceList.findMany.mockResolvedValue([]);
    const service = new B2bService(db as any);

    await service.addCartLine('c1', 'u1', { variantId: 'v1', quantity: 3, currency: 'eur' });

    expect(db.b2bCart.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId_userId_currency: { companyId: 'c1', userId: 'u1', currency: 'EUR' } } }));
    expect(db.b2bCartLine.upsert).toHaveBeenCalledWith({ where: { cartId_variantId: { cartId: 'cart-1', variantId: 'v1' } }, update: { quantity: { increment: 3 } }, create: { cartId: 'cart-1', variantId: 'v1', quantity: 3 } });
  });

  it('prevents viewers from mutating a B2B cart', async () => {
    const db = prismaStub();
    db.company.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', customerGroup: { currency: 'USD' } });
    db.companyMembership.findFirst.mockResolvedValue({ id: 'm1', status: 'ACTIVE', role: 'VIEWER' });
    const service = new B2bService(db as any);

    await expect(service.addCartLine('c1', 'u1', { variantId: 'v1', quantity: 1 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.productVariant.findUnique).not.toHaveBeenCalled();
    expect(db.b2bCartLine.upsert).not.toHaveBeenCalled();
  });

  it('allows company members to read active addresses', async () => {
    const db = prismaStub();
    db.company.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', customerGroup: { currency: 'USD' } });
    db.companyMembership.findFirst.mockResolvedValue({ id: 'm1', status: 'ACTIVE', role: 'BUYER' });
    db.companyAddress.findMany.mockResolvedValue([{ id: 'a1', companyId: 'c1', archivedAt: null }]);
    const service = new B2bService(db as any);

    await expect(service.companyAddresses('c1', 'u1')).resolves.toEqual([{ id: 'a1', companyId: 'c1', archivedAt: null }]);
    expect(db.companyAddress.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'c1', archivedAt: null } }));
  });

  it('normalizes company addresses and keeps one default per type', async () => {
    const db = prismaStub();
    db.company.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', customerGroup: { currency: 'USD' } });
    db.companyMembership.findFirst.mockResolvedValue({ id: 'm1', status: 'ACTIVE', role: 'OWNER' });
    db.companyAddress.create.mockResolvedValue({ id: 'a2', companyId: 'c1' });
    const service = new B2bService(db as any);

    await service.createCompanyAddress('c1', { recipientName: '  Acme Receiving ', line1: ' 12 Main ', city: ' Tehran ', postalCode: ' 123 ', countryCode: ' ir ', isDefaultShipping: true, isDefaultBilling: true } as any, 'u1');

    expect(db.companyAddress.updateMany).toHaveBeenCalledTimes(2);
    expect(db.companyAddress.create.mock.calls[0][0].data).toMatchObject({
      recipientName: 'Acme Receiving', line1: '12 Main', city: 'Tehran', postalCode: '123', countryCode: 'IR', isDefaultShipping: true, isDefaultBilling: true,
    });
  });

  it('prevents buyers from creating or archiving company addresses', async () => {
    const db = prismaStub();
    db.company.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', customerGroup: { currency: 'USD' } });
    db.companyMembership.findFirst.mockResolvedValue({ id: 'm1', status: 'ACTIVE', role: 'BUYER' });
    const service = new B2bService(db as any);

    await expect(service.createCompanyAddress('c1', {} as any, 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.archiveCompanyAddress('c1', 'a1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.companyAddress.create).not.toHaveBeenCalled();
    expect(db.companyAddress.update).not.toHaveBeenCalled();
  });

  it('creates a server-priced purchase request and clears the source cart', async () => {
    const db = prismaStub();
    const variant = { id: 'v1', sku: 'SKU-1', name: 'Bulk item', basePriceMinor: 100, currency: 'USD', isActive: true, minimumOrderQty: 1, packSize: 1, quantityIncrement: 1, stockQty: 20, product: { id: 'p1', name: 'Product', isActive: true } };
    db.company.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', customerGroupId: 'g1', customerGroup: { currency: 'USD' } });
    db.companyMembership.findFirst.mockResolvedValue({ id: 'm1', status: 'ACTIVE', role: 'BUYER' });
    db.companyAddress.findFirst.mockResolvedValue({ id: 'a1', companyId: 'c1', label: 'Warehouse', recipientName: 'Acme', line1: '1 Main', city: 'Tehran', postalCode: '123', countryCode: 'IR' });
    db.b2bCart.findUnique.mockResolvedValue({ id: 'cart-1', lines: [{ id: 'line-1', quantity: 2, variant }] });
    db.priceList.findMany.mockResolvedValue([]);
    db.b2bPurchaseRequest.create.mockResolvedValue({ id: 'request-1', subtotalMinor: 200, lines: [] });
    const service = new B2bService(db as any);

    await expect(service.createPurchaseRequest('c1', 'u1', { addressId: 'a1', currency: 'usd', notes: 'Urgent' } as any)).resolves.toMatchObject({ id: 'request-1', subtotalMinor: 200 });
    expect(db.b2bPurchaseRequest.create.mock.calls[0][0].data).toMatchObject({ companyId: 'c1', requesterId: 'u1', currency: 'USD', subtotalMinor: 200, notes: 'Urgent' });
    expect(db.b2bCartLine.deleteMany).toHaveBeenCalledWith({ where: { cartId: 'cart-1' } });
  });

  it('requires a reason for rejection and only owners/admins can review', async () => {
    const db = prismaStub();
    db.company.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', customerGroup: { currency: 'USD' } });
    db.companyMembership.findFirst.mockResolvedValue({ id: 'm1', status: 'ACTIVE', role: 'BUYER' });
    const service = new B2bService(db as any);
    await expect(service.reviewPurchaseRequest('c1', 'r1', { decision: 'REJECTED' } as any, 'u1')).rejects.toBeInstanceOf(ForbiddenException);

    db.companyMembership.findFirst.mockResolvedValue({ id: 'm1', status: 'ACTIVE', role: 'ADMIN' });
    db.b2bPurchaseRequest.findFirst.mockResolvedValue({ id: 'r1', companyId: 'c1', status: 'SUBMITTED' });
    await expect(service.reviewPurchaseRequest('c1', 'r1', { decision: 'REJECTED' } as any, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.b2bPurchaseRequest.update).not.toHaveBeenCalled();
  });

  it('converts an approved request into a pending-manual-payment B2B order', async () => {
    const db = prismaStub();
    db.company.findUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', customerGroup: { currency: 'USD' } });
    db.companyMembership.findFirst.mockResolvedValue({ id: 'm1', status: 'ACTIVE', role: 'BUYER' });
    db.b2bPurchaseRequest.findFirst.mockResolvedValue({ id: 'r1', companyId: 'c1', requesterId: 'u1', status: 'APPROVED', currency: 'USD', shippingAddress: { city: 'Tehran' }, subtotalMinor: 200, lines: [{ variantId: 'v1', sku: 'SKU-1', productName: 'Bulk item', quantity: 2, unitPriceMinor: 100, subtotalMinor: 200, variant: { isActive: true, stockQty: 10 } }] });
    db.b2bOrder.create.mockResolvedValue({ id: 'o1', number: 'B2B-1', paymentStatus: 'PENDING_MANUAL', totalMinor: 200, lines: [] });
    const service = new B2bService(db as any);

    await expect(service.createB2bOrder('c1', 'r1', 'u1')).resolves.toMatchObject({ id: 'o1', paymentStatus: 'PENDING_MANUAL' });
    expect(db.b2bOrder.create.mock.calls[0][0].data).toMatchObject({ companyId: 'c1', purchaseRequestId: 'r1', createdById: 'u1', status: 'PENDING', paymentStatus: 'PENDING_MANUAL', totalMinor: 200 });
  });

  it('does not allow staff to move a completed B2B order backwards', async () => {
    const db = prismaStub();
    db.b2bOrder.findUnique.mockResolvedValue({ id: 'o1', status: 'DELIVERED' });
    const service = new B2bService(db as any);
    await expect(service.updateB2bOrderStatus('o1', 'PROCESSING', 'staff-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
