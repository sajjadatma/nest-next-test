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
    items: [{ productId, quantity: 1 }], shippingAddress: { fullName: 'Test Buyer', line1: '1 Market Street', city: 'Test City', postalCode: '10001', country: 'US' }, ...overrides,
  });

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
});
