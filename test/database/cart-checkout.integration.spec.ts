import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { AuditService } from '../../src/audit/audit.service';
import { CartRepository } from '../../src/commerce/cart/cart.repository';
import { CartService } from '../../src/commerce/cart/cart.service';
import { CheckoutLinkService } from '../../src/commerce/checkout/checkout-link.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SystemLogService } from '../../src/system-logs/system-log.service';

describe('Cart and signed checkout handoff database integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let carts: CartService;
  let links: CheckoutLinkService;
  let merchantA: string;
  let merchantB: string;
  let availableVariantId: string;
  let isolatedVariantId: string;
  let outOfStockVariantId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'cart-checkout-test-secret-that-is-longer-than-32-characters';
    process.env.SHOP_PUBLIC_URL = 'https://shop.example.test';
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    const [firstMerchant, secondMerchant] = await Promise.all([
      prisma.merchant.create({ data: { slug: 'cart-merchant-a', name: 'Cart merchant A' } }),
      prisma.merchant.create({ data: { slug: 'cart-merchant-b', name: 'Cart merchant B' } }),
    ]);
    merchantA = firstMerchant.id;
    merchantB = secondMerchant.id;
    const category = await prisma.category.create({ data: { slug: 'cart-checkout-category', name: 'Cart checkout category' } });
    const availableProduct = await prisma.product.create({ data: { merchantId: merchantA, name: 'Available product', slug: 'cart-available', description: 'Available', categoryId: category.id, priceMinor: 1200, stockQty: 5 } });
    const availableVariant = await prisma.productVariant.create({ data: { productId: availableProduct.id, sku: 'CART-AVAILABLE', priceMinor: 1200, currency: 'USD', stockQty: 5, isDefault: true } });
    const isolatedProduct = await prisma.product.create({ data: { merchantId: merchantB, name: 'Isolated product', slug: 'cart-isolated', description: 'Isolated', categoryId: category.id, priceMinor: 900, stockQty: 2 } });
    const isolatedVariant = await prisma.productVariant.create({ data: { productId: isolatedProduct.id, sku: 'CART-ISOLATED', priceMinor: 900, currency: 'USD', stockQty: 2, isDefault: true } });
    const outOfStockProduct = await prisma.product.create({ data: { merchantId: merchantA, name: 'Out product', slug: 'cart-out', description: 'Out', categoryId: category.id, priceMinor: 600, stockQty: 0 } });
    const outOfStockVariant = await prisma.productVariant.create({ data: { productId: outOfStockProduct.id, sku: 'CART-OUT', priceMinor: 600, currency: 'USD', stockQty: 0, isDefault: true } });
    availableVariantId = availableVariant.id;
    isolatedVariantId = isolatedVariant.id;
    outOfStockVariantId = outOfStockVariant.id;

    const prismaService = prisma as unknown as PrismaService;
    carts = new CartService(new CartRepository(prismaService), new AuditService(prismaService, new SystemLogService(prismaService)));
    links = new CheckoutLinkService(carts);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('persists merchant-scoped verified lines, increments a duplicate add, and snapshots totals', async () => {
    const cart = await carts.createCart({ merchantId: merchantA, externalUserId: 'external-cart-user' });
    const first = await carts.addToCart({ merchantId: merchantA, cartId: cart.id, variantId: availableVariantId, quantity: 2 });
    const second = await carts.addToCart({ merchantId: merchantA, cartId: cart.id, variantId: availableVariantId, quantity: 1 });
    const rows = await prisma.cartItem.findMany({ where: { cartId: cart.id } });

    expect(first.items).toHaveLength(1);
    expect(second.items).toMatchObject([{ variantId: availableVariantId, quantity: 3, unitPriceMinor: 1200, currency: 'USD' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variantId: availableVariantId, quantity: 3, unitPriceMinor: 1200, currency: 'USD' });
    await expect(prisma.cart.findUniqueOrThrow({ where: { id: cart.id }, select: { subtotalMinor: true, status: true } })).resolves.toEqual({ subtotalMinor: 3600, status: 'ACTIVE' });
  });

  it('fails closed for stock shortfall, foreign variants, and cross-merchant cart access', async () => {
    const cart = await carts.createCart({ merchantId: merchantA });
    await expect(carts.addToCart({ merchantId: merchantA, cartId: cart.id, variantId: outOfStockVariantId, quantity: 1 })).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    await expect(carts.addToCart({ merchantId: merchantA, cartId: cart.id, variantId: isolatedVariantId, quantity: 1 })).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    await expect(carts.getCart(merchantB, cart.id)).resolves.toBeNull();
  });

  it('creates a signed checkout URL and rejects tampered and expired token verification', async () => {
    const cart = await carts.createCart({ merchantId: merchantA });
    await carts.addToCart({ merchantId: merchantA, cartId: cart.id, variantId: availableVariantId, quantity: 1 });
    const handoff = await links.createCheckoutLink(merchantA, cart.id);
    const token = new URL(handoff.checkoutUrl).searchParams.get('checkout_token')!;

    await expect(links.verifyCheckoutLink(token)).resolves.toMatchObject({ cartId: cart.id, merchantId: merchantA, lines: [{ variantId: availableVariantId, quantity: 1, unitPriceMinor: 1200 }] });
    await expect(links.verifyCheckoutLink(`${token.slice(0, -1)}x`)).rejects.toMatchObject({ code: 'CHECKOUT_LINK_INVALID' });
    const expiredPayload = Buffer.from(JSON.stringify({ cartId: cart.id, merchantId: merchantA, lines: [{ variantId: availableVariantId, quantity: 1, unitPriceMinor: 1200, currency: 'USD' }], priceSnapshotMinor: 1200, expiresAt: new Date(Date.now() - 1_000).toISOString() })).toString('base64url');
    const expiredToken = `${expiredPayload}.${createHmac('sha256', process.env.JWT_SECRET!).update(expiredPayload).digest('base64url')}`;
    await expect(links.verifyCheckoutLink(expiredToken)).rejects.toMatchObject({ code: 'CHECKOUT_LINK_EXPIRED' });
    await expect(prisma.cart.findUniqueOrThrow({ where: { id: cart.id }, select: { status: true, expiresAt: true, checkoutTokenHash: true } })).resolves.toMatchObject({ status: 'HANDED_OFF', expiresAt: expect.any(Date), checkoutTokenHash: expect.any(String) });
  });
});
