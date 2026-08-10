import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { CartService } from '../../src/commerce/cart/cart.service';
import { CheckoutLinkService } from '../../src/commerce/checkout/checkout-link.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('checkout handoff API integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let carts: CartService;
  let links: CheckoutLinkService;
  let merchantA: string;
  let merchantB: string;
  let variantId: string;

  const headers = (merchantId: string) => ({ 'x-merchant-id': merchantId });

  beforeAll(async () => {
    process.env.JWT_SECRET = 'checkout-handoff-test-secret-that-is-longer-than-32-characters';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    carts = app.get(CartService);
    links = app.get(CheckoutLinkService);

    const suffix = randomUUID();
    const [firstMerchant, secondMerchant] = await Promise.all([
      prisma.merchant.create({ data: { slug: `checkout-handoff-a-${suffix}`, name: 'Checkout handoff A' } }),
      prisma.merchant.create({ data: { slug: `checkout-handoff-b-${suffix}`, name: 'Checkout handoff B' } }),
    ]);
    merchantA = firstMerchant.id;
    merchantB = secondMerchant.id;
    const category = await prisma.category.create({ data: { slug: `checkout-handoff-${suffix}`, name: 'Checkout handoff category' } });
    const product = await prisma.product.create({ data: { merchantId: merchantA, name: 'Checkout handoff product', slug: `checkout-handoff-product-${suffix}`, description: 'Checkout handoff product', categoryId: category.id, priceMinor: 1200, stockQty: 5 } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `CHECKOUT-HANDOFF-${suffix}`, priceMinor: 1200, currency: 'USD', stockQty: 5, isDefault: true } });
    variantId = variant.id;
    await prisma.product.update({ where: { id: product.id }, data: { defaultVariantId: variant.id } });
  });

  afterAll(async () => app.close());

  async function handoffToken() {
    const cart = await carts.createCart({ merchantId: merchantA, externalUserId: randomUUID() });
    await carts.addToCart({ merchantId: merchantA, cartId: cart.id, variantId, quantity: 1 });
    const handoff = await links.createCheckoutLink(merchantA, cart.id);
    return { cart, token: new URL(handoff.checkoutUrl).searchParams.get('checkout_token')! };
  }

  it('returns a current cart snapshot for a valid handoff and denies a different merchant', async () => {
    const { cart, token } = await handoffToken();

    const valid = await request(app.getHttpServer()).get(`/api/checkout/handoff/${encodeURIComponent(token)}`).set(headers(merchantA));
    expect(valid.status).toBe(200);
    expect(valid.body).toMatchObject({ cartId: cart.id, status: 'HANDED_OFF', expiresAt: expect.any(String), canCheckout: true, items: [{ variantId, quantity: 1, unitPriceMinor: 1200, currency: 'USD', availability: 'IN_STOCK' }] });
    await expect(prisma.auditLog.findFirstOrThrow({ where: { action: 'commerce.checkout_handoff_opened', targetId: cart.id } })).resolves.toMatchObject({ metadata: { merchantId: merchantA, canCheckout: true } });

    await expect(request(app.getHttpServer()).get(`/api/checkout/handoff/${encodeURIComponent(token)}`).set(headers(merchantB))).resolves.toMatchObject({ status: 404 });
  });

  it('fails closed for expired, tampered, and malformed tokens', async () => {
    const { cart, token } = await handoffToken();
    const payload = Buffer.from(JSON.stringify({ cartId: cart.id, merchantId: merchantA, lines: [{ variantId, quantity: 1, unitPriceMinor: 1200, currency: 'USD' }], priceSnapshotMinor: 1200, expiresAt: new Date(Date.now() - 1_000).toISOString() })).toString('base64url');
    const expiredToken = `${payload}.${createHmac('sha256', process.env.JWT_SECRET!).update(payload).digest('base64url')}`;

    await expect(request(app.getHttpServer()).get(`/api/checkout/handoff/${encodeURIComponent(expiredToken)}`).set(headers(merchantA))).resolves.toMatchObject({ status: 200, body: { canCheckout: false, reason: 'EXPIRED' } });
    await expect(request(app.getHttpServer()).get(`/api/checkout/handoff/${encodeURIComponent(`${token.slice(0, -1)}x`)}`).set(headers(merchantA))).resolves.toMatchObject({ status: 200, body: { canCheckout: false, reason: 'INVALID' } });
    await expect(request(app.getHttpServer()).get('/api/checkout/handoff/malformed').set(headers(merchantA))).resolves.toMatchObject({ status: 400 });
  });

  it('returns current stock and price failures without accepting checkout', async () => {
    const outOfStock = await handoffToken();
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 0 } });
    await expect(request(app.getHttpServer()).get(`/api/checkout/handoff/${encodeURIComponent(outOfStock.token)}`).set(headers(merchantA))).resolves.toMatchObject({ status: 200, body: { canCheckout: false, reason: 'OUT_OF_STOCK', items: [{ availability: 'OUT_OF_STOCK' }] } });

    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 5 } });
    const priceChanged = await handoffToken();
    await prisma.productVariant.update({ where: { id: variantId }, data: { priceMinor: 1400 } });
    await expect(request(app.getHttpServer()).get(`/api/checkout/handoff/${encodeURIComponent(priceChanged.token)}`).set(headers(merchantA))).resolves.toMatchObject({ status: 200, body: { canCheckout: false, reason: 'PRICE_CHANGED', items: [{ unitPriceMinor: 1400 }] } });
  });

  it('returns EMPTY when a previously handed-off cart no longer has items', async () => {
    await prisma.productVariant.update({ where: { id: variantId }, data: { priceMinor: 1200, stockQty: 5 } });
    const { cart, token } = await handoffToken();
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    await expect(request(app.getHttpServer()).get(`/api/checkout/handoff/${encodeURIComponent(token)}`).set(headers(merchantA))).resolves.toMatchObject({ status: 200, body: { cartId: cart.id, canCheckout: false, reason: 'EMPTY', items: [] } });
  });
});
