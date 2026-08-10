import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { AuditService } from '../../src/audit/audit.service';
import { CommerceToolsService } from '../../src/commerce/commerce-tools.service';
import { ConversationService } from '../../src/conversations/conversation.service';
import { ShippingReadRepository } from '../../src/commerce/shipping/shipping-read.repository';
import { ShippingReadService } from '../../src/commerce/shipping/shipping-read.service';
import { VariantReadService } from '../../src/commerce/variants/variant-read.service';
import { VariantRepository } from '../../src/commerce/variants/variant.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SystemLogService } from '../../src/system-logs/system-log.service';

describe('CommerceToolsService database integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let tools: CommerceToolsService;
  let merchantA: string;
  let merchantB: string;
  let persianProductId: string;
  let freshProductId: string;
  let freshVariantId: string;
  let isolatedProductId: string;
  let isolatedVariantId: string;
  let outOfStockVariantId: string;
  let customerWithAccountId: string;
  let customerWithoutAccountId: string;
  let isolatedCustomerId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    const [firstMerchant, secondMerchant] = await Promise.all([
      prisma.merchant.create({ data: { slug: 'commerce-tools-a', name: 'Commerce tools A' } }),
      prisma.merchant.create({ data: { slug: 'commerce-tools-b', name: 'Commerce tools B' } }),
    ]);
    merchantA = firstMerchant.id;
    merchantB = secondMerchant.id;
    const category = await prisma.category.create({ data: { slug: 'commerce-tools-shoes', name: 'Shoes' } });

    const persianProduct = await prisma.product.create({ data: { merchantId: merchantA, name: 'کفش سفید', slug: 'persian-white-shoe', description: 'کفش ورزشی سفید', categoryId: category.id, priceMinor: 900, stockQty: 3, images: { create: [{ url: 'https://example.test/fa.jpg', alt: 'کفش سفید', position: 0 }] } } });
    const persianVariant = await prisma.productVariant.create({ data: { productId: persianProduct.id, sku: 'TOOLS-FA-1', color: 'سفید', size: '42', otherAttributes: { material: 'Mesh' }, priceMinor: 900, currency: 'IRR', stockQty: 3, isDefault: true } });
    persianProductId = persianProduct.id;
    await prisma.product.update({ where: { id: persianProduct.id }, data: { defaultVariantId: persianVariant.id } });

    const freshProduct = await prisma.product.create({ data: { merchantId: merchantA, name: 'White Runner', slug: 'white-runner', description: 'English running shoe', categoryId: category.id, priceMinor: 1200, stockQty: 5, images: { create: [{ url: 'https://example.test/runner-1.jpg', alt: 'Runner front', position: 0 }, { url: 'https://example.test/runner-2.jpg', alt: 'Runner rear', position: 1 }] } } });
    const freshVariant = await prisma.productVariant.create({ data: { productId: freshProduct.id, sku: 'TOOLS-EN-1', color: 'White', size: '42', otherAttributes: { use: 'running' }, priceMinor: 1200, currency: 'USD', stockQty: 5, isDefault: true } });
    await prisma.product.update({ where: { id: freshProduct.id }, data: { defaultVariantId: freshVariant.id } });
    freshProductId = freshProduct.id;
    freshVariantId = freshVariant.id;

    const outOfStockProduct = await prisma.product.create({ data: { merchantId: merchantA, name: 'Out Stock Runner', slug: 'out-stock-runner', description: 'Unavailable runner', categoryId: category.id, priceMinor: 700, stockQty: 0 } });
    const outOfStockVariant = await prisma.productVariant.create({ data: { productId: outOfStockProduct.id, sku: 'TOOLS-OOS-1', priceMinor: 700, currency: 'USD', stockQty: 0, isDefault: true } });
    await prisma.product.update({ where: { id: outOfStockProduct.id }, data: { defaultVariantId: outOfStockVariant.id } });
    outOfStockVariantId = outOfStockVariant.id;

    const isolatedProduct = await prisma.product.create({ data: { merchantId: merchantB, name: 'Private Runner', slug: 'private-runner', description: 'Merchant B only', categoryId: category.id, priceMinor: 500, stockQty: 2 } });
    const isolatedVariant = await prisma.productVariant.create({ data: { productId: isolatedProduct.id, sku: 'TOOLS-B-1', priceMinor: 500, currency: 'USD', stockQty: 2, isDefault: true } });
    await prisma.product.update({ where: { id: isolatedProduct.id }, data: { defaultVariantId: isolatedVariant.id } });
    isolatedProductId = isolatedProduct.id;
    isolatedVariantId = isolatedVariant.id;

    await prisma.shippingMethod.createMany({ data: [
      { code: 'standard', label: 'Standard delivery', description: 'Reliable delivery', eta: '3–5 business days', priceMinor: 0, position: 0 },
      { code: 'express', label: 'Express delivery', description: 'Priority delivery', eta: '1–2 business days', priceMinor: 1200, position: 1 },
      { code: 'disabled', label: 'Disabled', eta: 'never', priceMinor: 1, position: 2, isActive: false },
    ] });

    const account = await prisma.user.create({ data: { email: 'customer-context@example.test', passwordHash: 'hash' } });
    const [customerWithAccount, customerWithoutAccount, isolatedCustomer] = await Promise.all([
      prisma.customer.create({ data: { merchantId: merchantA, userId: account.id } }),
      prisma.customer.create({ data: { merchantId: merchantA } }),
      prisma.customer.create({ data: { merchantId: merchantB } }),
    ]);
    customerWithAccountId = customerWithAccount.id;
    customerWithoutAccountId = customerWithoutAccount.id;
    isolatedCustomerId = isolatedCustomer.id;
    await prisma.conversation.createMany({ data: [
      { merchantId: merchantA, customerId: customerWithAccount.id, channel: 'web' },
      { merchantId: merchantA, customerId: customerWithAccount.id, channel: 'telegram' },
      { merchantId: merchantA, customerId: customerWithoutAccount.id, channel: 'web' },
      { merchantId: merchantB, customerId: isolatedCustomer.id, channel: 'web' },
    ] });
    await prisma.order.createMany({ data: [
      { number: 'customer-context-1', email: 'customer-context@example.test', phone: '10000000001', customerId: account.id, subtotalMinor: 100, totalMinor: 100, shippingAddress: {}, idempotencyKey: 'customer-context-key-1', confirmationTokenHash: 'customer-context-token-1' },
      { number: 'customer-context-2', email: 'customer-context@example.test', phone: '10000000002', customerId: account.id, subtotalMinor: 200, totalMinor: 200, shippingAddress: {}, idempotencyKey: 'customer-context-key-2', confirmationTokenHash: 'customer-context-token-2' },
    ] });

    const prismaService = prisma as unknown as PrismaService;
    tools = new CommerceToolsService(
      new VariantReadService(new VariantRepository(prismaService)),
      new ShippingReadService(new ShippingReadRepository(prismaService)),
      new ConversationService(prismaService),
      new AuditService(prismaService, new SystemLogService(prismaService)),
    );
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it('returns current Persian and English scoped catalog truth with audit correlation', async () => {
    const [persian, english] = await Promise.all([
      tools.searchProducts({ merchantId: merchantA, query: 'سفید', category: 'shoes', currency: 'IRR' }, { correlationId: 'commerce-fa' }),
      tools.searchProducts({ merchantId: merchantA, query: 'runner', attributes: { use: 'running' }, budgetMax: 1200, currency: 'USD' }, { correlationId: 'commerce-en' }),
    ]);

    expect(persian).toMatchObject({ ok: true, data: { matched: true, items: [{ title: 'کفش سفید', priceMinor: 900, currency: 'IRR', availability: 'IN_STOCK', imageUrl: 'https://example.test/fa.jpg' }] } });
    expect(english).toMatchObject({ ok: true, data: { matched: true, items: [{ productId: freshProductId, title: 'White Runner', canonicalAttributes: { use: 'running' } }] } });
    await expect(prisma.auditLog.count({ where: { action: 'commerce.search_products', metadata: { path: ['correlationId'], equals: 'commerce-fa' } } })).resolves.toBe(1);
  });

  it('keeps no-match, out-of-stock, and merchant isolation distinct', async () => {
    await expect(tools.searchProducts({ merchantId: merchantA, query: 'nothing-matches' })).resolves.toMatchObject({ ok: true, data: { matched: false, reason: 'NO_MATCH', items: [] } });
    await expect(tools.searchProducts({ merchantId: merchantA, query: 'out stock' })).resolves.toMatchObject({ ok: true, data: { matched: true, items: [{ availability: 'OUT_OF_STOCK' }] } });
    await expect(tools.getProduct({ merchantId: merchantA, productId: isolatedProductId })).resolves.toMatchObject({ ok: false, code: 'PRODUCT_NOT_FOUND' });
  });

  it('reads stale price and stock values at each call instead of caching them', async () => {
    await prisma.productVariant.update({ where: { id: freshVariantId }, data: { priceMinor: 1450, stockQty: 0 } });

    await expect(tools.getProduct({ merchantId: merchantA, productId: freshProductId })).resolves.toMatchObject({
      ok: true, data: { defaultVariant: { priceMinor: 1450, stockQty: 0, availability: 'OUT_OF_STOCK' }, availability: 'OUT_OF_STOCK' },
    });
  });

  it('returns variant inventory, prices, and ordered image data from current scoped records', async () => {
    await expect(tools.checkInventory({ merchantId: merchantA, variantId: outOfStockVariantId }, { correlationId: 'inventory-db' })).resolves.toMatchObject({
      ok: true, data: { variantId: outOfStockVariantId, stockQty: 0, availability: 'OUT_OF_STOCK', at: expect.any(String) },
    });
    await expect(tools.checkInventory({ merchantId: merchantA, variantId: isolatedVariantId })).resolves.toMatchObject({ ok: false, code: 'VARIANT_NOT_FOUND' });
    await expect(tools.getPrice({ merchantId: merchantA, variantId: freshVariantId })).resolves.toMatchObject({
      ok: true, data: { variantId: freshVariantId, priceMinor: 1450, currency: 'USD', updatedAt: expect.any(String), at: expect.any(String) },
    });
    await expect(tools.getProductImages({ merchantId: merchantA, productId: freshProductId })).resolves.toMatchObject({
      ok: true, data: { productId: freshProductId, images: [{ url: 'https://example.test/runner-1.jpg', position: 0 }, { url: 'https://example.test/runner-2.jpg', position: 1 }] },
    });
    await expect(prisma.auditLog.count({ where: { action: 'commerce.check_inventory', metadata: { path: ['correlationId'], equals: 'inventory-db' } } })).resolves.toBe(1);
  });

  it('compares scoped products and returns only active shipping methods without order or stock side effects', async () => {
    await expect(tools.compareProducts({ merchantId: merchantA, productIds: [freshProductId, persianProductId] })).resolves.toMatchObject({
      ok: true, data: { items: [{ productId: freshProductId, canonicalAttributes: { use: 'running' } }, { productId: persianProductId, canonicalAttributes: { material: 'Mesh' } }] },
    });
    await expect(tools.compareProducts({ merchantId: merchantA, productIds: [freshProductId, isolatedProductId] })).resolves.toMatchObject({ ok: false, code: 'PRODUCT_NOT_FOUND' });
    await expect(tools.compareProducts({ merchantId: merchantA, productIds: [freshProductId, freshProductId] })).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    const shipping = await tools.getShippingEstimate({ merchantId: merchantA }, { correlationId: 'shipping-db' });
    expect(shipping).toMatchObject({ ok: true, data: { methods: [{ id: 'standard', priceMinor: 0 }, { id: 'express', priceMinor: 1200 }], at: expect.any(String) } });
    expect(shipping.ok && shipping.data.methods).not.toContainEqual(expect.objectContaining({ id: 'disabled' }));
    await expect(prisma.order.count()).resolves.toBe(2);
    await expect(prisma.productVariant.findUniqueOrThrow({ where: { id: freshVariantId }, select: { stockQty: true } })).resolves.toMatchObject({ stockQty: 0 });
    await expect(prisma.auditLog.count({ where: { action: 'commerce.get_shipping_estimate', metadata: { path: ['correlationId'], equals: 'shipping-db' } } })).resolves.toBe(1);
  });

  it('returns only merchant-scoped aggregate customer context, redacts identity data, and rejects cross-merchant reads', async () => {
    const context = await tools.getCustomerContext({ merchantId: merchantA, customerId: customerWithAccountId }, { correlationId: 'customer-context-db' });

    expect(context).toMatchObject({ ok: true, data: { customerId: customerWithAccountId, hasUserAccount: true, conversationCount: 2, orderCount: 2, at: expect.any(String) } });
    expect(context.ok && Object.keys(context.data).sort()).toEqual(['at', 'conversationCount', 'customerId', 'hasUserAccount', 'orderCount']);
    await expect(tools.getCustomerContext({ merchantId: merchantA, customerId: customerWithoutAccountId })).resolves.toMatchObject({ ok: true, data: { hasUserAccount: false, conversationCount: 1, orderCount: 0 } });
    await expect(tools.getCustomerContext({ merchantId: merchantA, customerId: isolatedCustomerId })).resolves.toMatchObject({ ok: false, code: 'CUSTOMER_NOT_FOUND' });
    await expect(tools.getCustomerContext({ merchantId: merchantA, customerId: 'missing-customer' })).resolves.toMatchObject({ ok: false, code: 'CUSTOMER_NOT_FOUND' });
    await expect(tools.getCustomerContext({ merchantId: merchantA, customerId: customerWithAccountId, email: 'forbidden@example.test' } as never)).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    await expect(prisma.auditLog.count({ where: { action: 'commerce.get_customer_context', metadata: { path: ['correlationId'], equals: 'customer-context-db' } } })).resolves.toBe(1);
    await expect(prisma.auditLog.findFirstOrThrow({ where: { action: 'commerce.get_customer_context', metadata: { path: ['correlationId'], equals: 'customer-context-db' } }, select: { metadata: true } })).resolves.toMatchObject({ metadata: { correlationId: 'customer-context-db', ok: true } });
  });
});
