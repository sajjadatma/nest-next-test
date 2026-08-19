import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Shop integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productId: string;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const category = await prisma.category.create({ data: { name: 'Shop tests', slug: `shop-tests-${randomUUID()}` } });
    const product = await prisma.product.create({ data: { name: 'Concurrency test product', slug: `concurrency-${randomUUID()}`, description: 'Test inventory guarantees', priceMinor: 2500, stockQty: 5, categoryId: category.id } });
    productId = product.id;
    const registration = await request(app.getHttpServer()).post('/api/auth/register').send({ email: `shop-${randomUUID()}@example.com`, password: 'password123', name: 'Shop Customer' });
    token = registration.body.accessToken;
    userId = registration.body.user.id;
  });

  afterAll(async () => app.close());

  const checkout = (overrides: Record<string, unknown> = {}) => ({
    email: 'buyer@example.com', phone: '+1 555 010 1200', idempotencyKey: randomUUID(), confirmationToken: randomUUID(),
    items: [{ productId, quantity: 1 }], shippingMethod: 'standard', shippingAddress: { fullName: 'Test Buyer', line1: '1 Market Street', city: 'Test City', postalCode: '10001', country: 'US' }, ...overrides,
  });

  async function registerScopedUser(permissionKeys: string[]) {
    const registration = await request(app.getHttpServer()).post('/api/auth/register').send({ email: `staff-${randomUUID()}@example.com`, password: 'password123', name: 'Shop Staff' });
    expect(registration.status).toBe(201);
    const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
    expect(permissions).toHaveLength(permissionKeys.length);
    await prisma.userPermission.createMany({ data: permissions.map((permission) => ({ userId: registration.body.user.id, permissionId: permission.id })) });
    return { userId: registration.body.user.id as string, authorization: { Authorization: `Bearer ${registration.body.accessToken}` } };
  }

  async function createOrderForOperations(overrides: Record<string, unknown> = {}) {
    const category = await prisma.category.create({ data: { name: `Operations ${randomUUID()}`, slug: `operations-${randomUUID()}` } });
    const product = await prisma.product.create({ data: { name: 'Operations product', slug: `operations-product-${randomUUID()}`, description: 'For management integration coverage', priceMinor: 2500, stockQty: 10, categoryId: category.id, ...overrides } });
    const payload = checkout({ items: [{ productId: product.id, quantity: 1 }] });
    const response = await request(app.getHttpServer()).post('/api/shop/orders').send(payload);
    expect(response.status).toBe(201);
    return { product, order: response.body as { id: string; number: string } };
  }

  it('creates an idempotent order with durable confirmation', async () => {
    const payload = checkout();
    const first = await request(app.getHttpServer()).post('/api/shop/orders').send(payload);
    const repeated = await request(app.getHttpServer()).post('/api/shop/orders').send(payload);
    expect(first.status).toBe(201);
    expect(repeated.status).toBe(201);
    expect(repeated.body.id).toBe(first.body.id);
    expect(first.body.idempotencyKey).toBeUndefined();
    expect(first.body.confirmationTokenHash).toBeUndefined();
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQty).toBe(4);
    const confirmation = await request(app.getHttpServer()).get(`/api/shop/orders/confirmation/${payload.confirmationToken}`);
    expect(confirmation.status).toBe(200);
    expect(confirmation.body).toMatchObject({ number: first.body.number, phone: payload.phone, totalMinor: 2500 });
    expect(confirmation.body.confirmationTokenHash).toBeUndefined();
  });

  it('links authenticated checkout to customer order history', async () => {
    const created = await request(app.getHttpServer()).post('/api/shop/orders').set('Authorization', `Bearer ${token}`).send(checkout({ email: 'member@example.com' }));
    expect(created.status).toBe(201);
    expect(created.body.customerId).toBe(userId);
    const history = await request(app.getHttpServer()).get('/api/shop/orders/mine').set('Authorization', `Bearer ${token}`);
    expect(history.status).toBe(200);
    expect(history.body.some((order: { id: string }) => order.id === created.body.id)).toBe(true);
  });

  it('prevents concurrent overselling with an atomic stock reservation', async () => {
    await prisma.product.update({ where: { id: productId }, data: { stockQty: 1 } });
    const [first, second] = await Promise.all([request(app.getHttpServer()).post('/api/shop/orders').send(checkout()), request(app.getHttpServer()).post('/api/shop/orders').send(checkout())]);
    expect([first.status, second.status].sort()).toEqual([201, 400]);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQty).toBe(0);
  });

  it('restores stock on cancellation and rejects invalid transitions', async () => {
    await prisma.product.update({ where: { id: productId }, data: { stockQty: 3 } });
    const created = await request(app.getHttpServer()).post('/api/shop/orders').send(checkout({ items: [{ productId, quantity: 2 }] }));
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'shop:manage' } });
    await prisma.userPermission.upsert({ where: { userId_permissionId: { userId, permissionId: permission.id } }, update: {}, create: { userId, permissionId: permission.id } });
    const cancelled = await request(app.getHttpServer()).patch(`/api/shop/admin/orders/${created.body.id}/status`).set('Authorization', `Bearer ${token}`).send({ status: 'CANCELLED', reason: 'Customer requested cancellation' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Customer requested cancellation' });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQty).toBe(3);
    const invalid = await request(app.getHttpServer()).patch(`/api/shop/admin/orders/${created.body.id}/status`).set('Authorization', `Bearer ${token}`).send({ status: 'CONFIRMED' });
    expect(invalid.status).toBe(409);
  });

  it('rejects malformed checkout contact and idempotency data', async () => {
    const response = await request(app.getHttpServer()).post('/api/shop/orders').send(checkout({ phone: 'x', idempotencyKey: 'not-a-uuid' }));
    expect(response.status).toBe(400);
  });

  it('returns product details and calculates delivery on the server', async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    const details = await request(app.getHttpServer()).get(`/api/shop/products/${product.slug}`);
    expect(details.status).toBe(200);
    expect(details.body).toMatchObject({ id: productId, isFavorite: false, commentCount: 0 });
    const options = await request(app.getHttpServer()).get('/api/shop/shipping-options');
    expect(options.body.map((option: { id: string }) => option.id)).toEqual(['standard', 'express']);
    await prisma.product.update({ where: { id: productId }, data: { stockQty: 2 } });
    const order = await request(app.getHttpServer()).post('/api/shop/orders').send(checkout({ shippingMethod: 'express' }));
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ subtotalMinor: 2500, shippingMinor: 1200, totalMinor: 3700, shippingMethod: 'express' });
  });

  it('quotes the exact cash-on-delivery total without reserving stock', async () => {
    const category = await prisma.category.create({ data: { name: `Quote ${randomUUID()}`, slug: `quote-${randomUUID()}` } });
    const product = await prisma.product.create({ data: { name: 'Quote product', slug: `quote-product-${randomUUID()}`, description: 'For quote coverage', priceMinor: 2500, stockQty: 2, categoryId: category.id } });
    const promotion = await prisma.promotion.create({ data: { code: `QUOTE${randomUUID().slice(0, 6)}`.toUpperCase(), type: 'PERCENTAGE', value: 10 } });
    const quote = await request(app.getHttpServer()).post('/api/shop/order-quote').send({ items: [{ productId: product.id, quantity: 1 }], shippingMethod: 'express', promotionCode: promotion.code });
    expect(quote.status).toBe(201);
    expect(quote.body).toMatchObject({ subtotalMinor: 2500, discountMinor: 250, shippingMinor: 1200, totalMinor: 3450, promotionCode: promotion.code });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty).toBe(2);
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id: promotion.id } })).usedCount).toBe(0);
  });

  it('persists favorites and authenticated product comments', async () => {
    const authorization = { Authorization: `Bearer ${token}` };
    expect((await request(app.getHttpServer()).put(`/api/shop/products/${productId}/favorite`).set(authorization)).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/api/shop/favorites').set(authorization)).body.productIds).toContain(productId);
    const created = await request(app.getHttpServer()).post(`/api/shop/products/${productId}/comments`).set(authorization).send({ body: 'Thoughtfully made and useful.', rating: 5 });
    expect(created.status).toBe(201);
    expect((await request(app.getHttpServer()).get(`/api/shop/products/${productId}/comments`)).body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id, rating: 5 })]));
    expect((await request(app.getHttpServer()).delete(`/api/shop/comments/${created.body.id}`).set(authorization)).status).toBe(200);
    expect((await request(app.getHttpServer()).delete(`/api/shop/products/${productId}/favorite`).set(authorization)).status).toBe(200);
  });

  it('edits, nests, reorders, and safely removes categories', async () => {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: 'shop:manage' } });
    await prisma.userPermission.upsert({ where: { userId_permissionId: { userId, permissionId: permission.id } }, update: {}, create: { userId, permissionId: permission.id } });
    const authorization = { Authorization: `Bearer ${token}` };
    const root = await request(app.getHttpServer()).post('/api/shop/admin/categories').set(authorization).send({ name: 'Parent category', slug: `parent-${randomUUID()}` });
    expect(root.status).toBe(201);
    const child = await request(app.getHttpServer()).post('/api/shop/admin/categories').set(authorization).send({ name: 'Child category', slug: `child-${randomUUID()}`, parentId: root.body.id });
    expect(child.status).toBe(201);
    expect(child.body.parentId).toBe(root.body.id);

    const edited = await request(app.getHttpServer()).put(`/api/shop/admin/categories/${child.body.id}`).set(authorization).send({ name: 'Edited child', slug: child.body.slug, parentId: root.body.id });
    expect(edited.status).toBe(200);
    expect(edited.body.name).toBe('Edited child');
    const nestedProduct = await prisma.product.create({ data: { name: 'Nested product', slug: `nested-${randomUUID()}`, description: 'Visible through its parent category', priceMinor: 1000, stockQty: 1, categoryId: child.body.id } });
    const parentCatalogue = await request(app.getHttpServer()).get('/api/shop/products').query({ category: root.body.slug });
    expect(parentCatalogue.body.some((product: { id: string }) => product.id === nestedProduct.id)).toBe(true);
    await prisma.product.delete({ where: { id: nestedProduct.id } });
    const cycle = await request(app.getHttpServer()).put(`/api/shop/admin/categories/${root.body.id}`).set(authorization).send({ name: root.body.name, slug: root.body.slug, parentId: child.body.id });
    expect(cycle.status).toBe(400);

    const moved = await request(app.getHttpServer()).patch(`/api/shop/admin/categories/${child.body.id}/position`).set(authorization).send({ parentId: null, position: 0 });
    expect(moved.status).toBe(200);
    expect(moved.body.parentId).toBeNull();
    expect((await request(app.getHttpServer()).delete(`/api/shop/admin/categories/${root.body.id}`).set(authorization)).status).toBe(200);
    expect((await request(app.getHttpServer()).delete(`/api/shop/admin/categories/${child.body.id}`).set(authorization)).status).toBe(200);

    const productCategory = (await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { categoryId: true } })).categoryId;
    const protectedRemoval = await request(app.getHttpServer()).delete(`/api/shop/admin/categories/${productCategory}`).set(authorization);
    expect(protectedRemoval.status).toBe(409);
  });

  it('allows an order-fulfilment specialist to persist notes and shipments without shop:manage', async () => {
    const { order } = await createOrderForOperations();
    const staff = await registerScopedUser(['shop:orders:fulfill']);

    expect((await request(app.getHttpServer()).get('/api/shop/admin/overview').set(staff.authorization)).status).toBe(403);
    expect((await request(app.getHttpServer()).get('/api/shop/admin/orders').set(staff.authorization)).status).toBe(200);

    const note = await request(app.getHttpServer()).post(`/api/shop/admin/orders/${order.id}/notes`).set(staff.authorization).send({ body: 'Packed with care.', isCustomerVisible: false });
    expect(note.status).toBe(201);
    expect(note.body).toMatchObject({ orderId: order.id, body: 'Packed with care.', isCustomerVisible: false, authorId: staff.userId });

    const shipment = await request(app.getHttpServer()).post(`/api/shop/admin/orders/${order.id}/shipments`).set(staff.authorization).send({ carrier: 'Test carrier', service: 'Ground', trackingNumber: 'TRACK-123' });
    expect(shipment.status).toBe(201);
    expect(await prisma.shipment.findUnique({ where: { id: shipment.body.id } })).toMatchObject({ orderId: order.id, carrier: 'Test carrier', trackingNumber: 'TRACK-123' });
  });

  it('loads scoped catalogue and inventory data without global shop access', async () => {
    const authorization = { Authorization: `Bearer ${token}` };
    expect((await request(app.getHttpServer()).get('/api/shop/admin/catalog').set(authorization)).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/api/shop/admin/inventory').set(authorization)).status).toBe(200);
  });

  it('enforces the reports API contract for an analytics-only staff member', async () => {
    const { order } = await createOrderForOperations();
    await prisma.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
    const staff = await registerScopedUser(['shop:analytics:read']);

    const response = await request(app.getHttpServer()).get('/api/shop/admin/reports').set(staff.authorization).query({ from: '2020-01-01T00:00:00.000Z', to: '2030-01-01T00:00:00.000Z' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ range: { from: '2020-01-01T00:00:00.000Z', to: '2030-01-01T00:00:00.000Z' }, orders: expect.any(Number), revenueMinor: expect.any(Number), shippingRevenueMinor: expect.any(Number), discountsMinor: expect.any(Number) });
    expect(response.body.topProducts).toEqual(expect.arrayContaining([expect.objectContaining({ productName: 'Operations product', _sum: expect.objectContaining({ quantity: 1 }) })]));
  });

  it('redeems an active promotion once and persists the server-calculated discount', async () => {
    const category = await prisma.category.create({ data: { name: `Promotion ${randomUUID()}`, slug: `promotion-${randomUUID()}` } });
    const product = await prisma.product.create({ data: { name: 'Promotion product', slug: `promotion-product-${randomUUID()}`, description: 'For promotion coverage', priceMinor: 2500, stockQty: 2, categoryId: category.id } });
    const promotion = await prisma.promotion.create({ data: { code: `SAVE${randomUUID().slice(0, 6)}`.toUpperCase(), type: 'PERCENTAGE', value: 10, usageLimit: 1 } });
    const order = await request(app.getHttpServer()).post('/api/shop/orders').send(checkout({ items: [{ productId: product.id, quantity: 1 }], promotionCode: promotion.code }));
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({ subtotalMinor: 2500, discountMinor: 250, totalMinor: 2250, promotionCode: promotion.code });
    expect(await prisma.promotion.findUnique({ where: { id: promotion.id }, select: { usedCount: true } })).toEqual({ usedCount: 1 });
  });

  it('uses each product low-stock threshold in analytics instead of a global cutoff', async () => {
    const category = await prisma.category.create({ data: { name: `Threshold ${randomUUID()}`, slug: `threshold-${randomUUID()}` } });
    const aboveThreshold = await prisma.product.create({ data: { name: 'Above own threshold', slug: `above-threshold-${randomUUID()}`, description: 'Should not be low stock', priceMinor: 1000, stockQty: 3, lowStockThreshold: 2, categoryId: category.id } });
    const belowThreshold = await prisma.product.create({ data: { name: 'Below own threshold', slug: `below-threshold-${randomUUID()}`, description: 'Should be low stock', priceMinor: 1000, stockQty: 2, lowStockThreshold: 2, categoryId: category.id } });
    const staff = await registerScopedUser(['shop:analytics:read']);

    const response = await request(app.getHttpServer()).get('/api/shop/admin/reports').set(staff.authorization);
    expect(response.status).toBe(200);
    expect(response.body.lowStock.map((product: { id: string }) => product.id)).toContain(belowThreshold.id);
    expect(response.body.lowStock.map((product: { id: string }) => product.id)).not.toContain(aboveThreshold.id);
  });
});
