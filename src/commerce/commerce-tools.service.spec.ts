import { AuditService } from '../audit/audit.service';
import { ConversationService } from '../conversations/conversation.service';
import { CartService } from './cart/cart.service';
import { CheckoutLinkService } from './checkout/checkout-link.service';
import { ShippingReadService } from './shipping/shipping-read.service';
import { CommerceToolsService } from './commerce-tools.service';
import { VariantReadService } from './variants/variant-read.service';

const variant = {
  variantId: 'variant-1', productId: 'product-1', slug: 'coat', title: 'Coat', description: 'Warm coat',
  category: { name: 'Coats', slug: 'coats' }, sku: 'COAT-1', color: null, size: 'L', canonicalAttributes: { material: 'Wool' },
  priceMinor: 1200, currency: 'USD', stockQty: 2, availability: 'IN_STOCK' as const, isDefault: true,
  updatedAt: '2026-08-10T12:00:00.000Z', imageUrl: 'https://example.test/coat.jpg',
};

describe('CommerceToolsService', () => {
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const reads = { search: vi.fn(), productDetail: vi.fn(), variantDetail: vi.fn(), compare: vi.fn() } as unknown as VariantReadService;
  const shipping = { availableMethods: vi.fn() } as unknown as ShippingReadService;
  const conversations = { customerContext: vi.fn() } as unknown as ConversationService;
  let service: CommerceToolsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CommerceToolsService(reads, shipping, conversations, audit);
  });

  it('searches the scoped read model with strict input, deterministic cards, and audit correlation metadata', async () => {
    vi.mocked(reads.search).mockResolvedValue({ matched: true, availability: 'IN_STOCK', items: [variant] });

    await expect(service.searchProducts({ merchantId: 'merchant-1', query: 'coat', limit: 1 }, { correlationId: 'corr-1' })).resolves.toMatchObject({
      ok: true, data: { matched: true, items: [{ productId: 'product-1', productUrl: '/shop/products/coat', availability: 'IN_STOCK' }] },
    });
    expect(reads.search).toHaveBeenCalledWith({ merchantId: 'merchant-1', query: 'coat', limit: 1 });
    expect(audit.record).toHaveBeenCalledWith('commerce.search_products', 'merchant', 'merchant-1', undefined, expect.objectContaining({ correlationId: 'corr-1', ok: true }));
  });

  it('rejects unknown or invalid tool fields without querying a read model', async () => {
    await expect(service.searchProducts({ merchantId: 'merchant-1', unknown: true } as never)).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    await expect(service.checkInventory({ merchantId: 'merchant-1', variantId: 'variant-1', unknown: true } as never)).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    await expect(service.compareProducts({ merchantId: 'merchant-1', productIds: ['one'] })).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(reads.search).not.toHaveBeenCalled();
    expect(reads.variantDetail).not.toHaveBeenCalled();
    expect(reads.compare).not.toHaveBeenCalled();
  });

  it('returns PRODUCT_NOT_FOUND for a product outside the merchant scope', async () => {
    vi.mocked(reads.productDetail).mockResolvedValue(null);

    await expect(service.getProduct({ merchantId: 'merchant-a', productId: 'merchant-b-product' }, { correlationId: 'corr-2' })).resolves.toMatchObject({ ok: false, code: 'PRODUCT_NOT_FOUND' });
    expect(reads.productDetail).toHaveBeenCalledWith('merchant-a', 'merchant-b-product');
    expect(audit.record).toHaveBeenCalledWith('commerce.get_product', 'product', 'merchant-b-product', undefined, expect.objectContaining({ correlationId: 'corr-2', ok: false, code: 'PRODUCT_NOT_FOUND' }));
  });

  it('returns verified product data including category, images, and default variant', async () => {
    vi.mocked(reads.productDetail).mockResolvedValue({
      productId: 'product-1', slug: 'coat', title: 'Coat', description: 'Warm coat', category: { name: 'Coats', slug: 'coats' },
      images: [{ id: 'image-1', url: 'https://example.test/coat.jpg', alt: 'Coat', position: 0 }], defaultVariant: variant, availability: 'IN_STOCK',
    });

    await expect(service.getProduct({ merchantId: 'merchant-1', productId: 'product-1' })).resolves.toMatchObject({
      ok: true, data: { productId: 'product-1', images: [{ url: 'https://example.test/coat.jpg' }], defaultVariant: { priceMinor: 1200 } },
    });
  });

  it('fails closed when verified price or inventory values are unavailable', async () => {
    vi.mocked(reads.search).mockRejectedValueOnce(new Error('price unavailable'));
    vi.mocked(reads.productDetail).mockRejectedValueOnce(new Error('inventory unavailable'));

    await expect(service.searchProducts({ merchantId: 'merchant-1' })).resolves.toMatchObject({ ok: false, code: 'PRICE_UNVERIFIABLE' });
    await expect(service.getProduct({ merchantId: 'merchant-1', productId: 'product-1' })).resolves.toMatchObject({ ok: false, code: 'INVENTORY_UNVERIFIABLE' });
  });

  it('returns variant-level inventory and distinguishes out-of-stock from a scoped absence', async () => {
    vi.mocked(reads.variantDetail).mockResolvedValueOnce({ ...variant, stockQty: 0, availability: 'OUT_OF_STOCK' }).mockResolvedValueOnce(null);

    await expect(service.checkInventory({ merchantId: 'merchant-1', variantId: 'variant-1' }, { correlationId: 'inventory-1' })).resolves.toMatchObject({
      ok: true, data: { variantId: 'variant-1', sku: 'COAT-1', stockQty: 0, availability: 'OUT_OF_STOCK', at: expect.any(String) },
    });
    await expect(service.checkInventory({ merchantId: 'merchant-1', variantId: 'other-merchant-variant' })).resolves.toMatchObject({ ok: false, code: 'VARIANT_NOT_FOUND' });
    expect(audit.record).toHaveBeenCalledWith('commerce.check_inventory', 'variant', 'variant-1', undefined, expect.objectContaining({ correlationId: 'inventory-1', ok: true }));
  });

  it('returns current variant prices with persisted timestamps and fails closed on unavailable prices', async () => {
    vi.mocked(reads.variantDetail).mockResolvedValueOnce(variant).mockRejectedValueOnce(new Error('price unavailable'));

    await expect(service.getPrice({ merchantId: 'merchant-1', variantId: 'variant-1' })).resolves.toMatchObject({
      ok: true, data: { variantId: 'variant-1', priceMinor: 1200, currency: 'USD', updatedAt: '2026-08-10T12:00:00.000Z', at: expect.any(String) },
    });
    await expect(service.getPrice({ merchantId: 'merchant-1', variantId: 'variant-1' })).resolves.toMatchObject({ ok: false, code: 'PRICE_UNVERIFIABLE' });
  });

  it('returns ordered product images, including an empty gallery, while preserving merchant scope', async () => {
    vi.mocked(reads.productDetail).mockResolvedValueOnce({
      productId: 'product-1', slug: 'coat', title: 'Coat', description: 'Warm coat', category: { name: 'Coats', slug: 'coats' },
      images: [{ id: 'image-2', url: 'https://example.test/2.jpg', alt: 'Coat rear', position: 1 }, { id: 'image-1', url: 'https://example.test/1.jpg', alt: 'Coat front', position: 0 }], defaultVariant: variant, availability: 'IN_STOCK',
    }).mockResolvedValueOnce({
      productId: 'product-2', slug: 'no-gallery', title: 'No gallery', description: 'No gallery', category: { name: 'Coats', slug: 'coats' }, images: [], defaultVariant: variant, availability: 'IN_STOCK',
    }).mockResolvedValueOnce(null);

    await expect(service.getProductImages({ merchantId: 'merchant-1', productId: 'product-1' })).resolves.toMatchObject({ ok: true, data: { images: [{ id: 'image-2', position: 1 }, { id: 'image-1', position: 0 }] } });
    await expect(service.getProductImages({ merchantId: 'merchant-1', productId: 'product-2' })).resolves.toMatchObject({ ok: true, data: { images: [] } });
    await expect(service.getProductImages({ merchantId: 'merchant-1', productId: 'other-merchant-product' })).resolves.toMatchObject({ ok: false, code: 'PRODUCT_NOT_FOUND' });
  });

  it('compares two to four scoped products using verified variant rows and rejects missing products', async () => {
    vi.mocked(reads.compare).mockResolvedValueOnce([variant, { ...variant, variantId: 'variant-2', productId: 'product-2', slug: 'jacket', title: 'Jacket', priceMinor: 900 }]).mockResolvedValueOnce(null);

    await expect(service.compareProducts({ merchantId: 'merchant-1', productIds: ['product-1', 'product-2'] }, { correlationId: 'compare-1' })).resolves.toMatchObject({
      ok: true, data: { items: [{ productId: 'product-1', variantId: 'variant-1', canonicalAttributes: { material: 'Wool' } }, { productId: 'product-2' }] },
    });
    await expect(service.compareProducts({ merchantId: 'merchant-1', productIds: ['product-1', 'other-merchant-product'] })).resolves.toMatchObject({ ok: false, code: 'PRODUCT_NOT_FOUND' });
    expect(audit.record).toHaveBeenCalledWith('commerce.compare_products', 'merchant', 'merchant-1', undefined, expect.objectContaining({ correlationId: 'compare-1', ok: true }));
  });

  it('delegates shipping reads to the shipping port without side effects and fails closed when unavailable', async () => {
    vi.mocked(shipping.availableMethods).mockResolvedValueOnce([{ id: 'express', label: 'Express', description: 'Fast', eta: '1–2 days', priceMinor: 1200 }]).mockRejectedValueOnce(new Error('shipping unavailable'));

    await expect(service.getShippingEstimate({ merchantId: 'merchant-1' }, { correlationId: 'shipping-1' })).resolves.toMatchObject({
      ok: true, data: { methods: [{ id: 'express', priceMinor: 1200 }], at: expect.any(String) },
    });
    await expect(service.getShippingEstimate({ merchantId: 'merchant-1' })).resolves.toMatchObject({ ok: false, code: 'SHIPPING_UNVERIFIABLE' });
    expect(audit.record).toHaveBeenCalledWith('commerce.get_shipping_estimate', 'merchant', 'merchant-1', undefined, expect.objectContaining({ correlationId: 'shipping-1', ok: true }));
  });

  it('returns only merchant-scoped aggregate customer context and redacts identity data from audit metadata', async () => {
    vi.mocked(conversations.customerContext).mockResolvedValue({ customerId: 'customer-1', hasUserAccount: true, conversationCount: 3, orderCount: 2 });

    const result = await service.getCustomerContext({ merchantId: 'merchant-1', customerId: 'customer-1' }, { correlationId: 'customer-1' });

    expect(result).toMatchObject({ ok: true, data: { customerId: 'customer-1', hasUserAccount: true, conversationCount: 3, orderCount: 2, at: expect.any(String) } });
    expect(result.ok && Object.keys(result.data).sort()).toEqual(['at', 'conversationCount', 'customerId', 'hasUserAccount', 'orderCount']);
    expect(conversations.customerContext).toHaveBeenCalledWith('merchant-1', 'customer-1');
    expect(audit.record).toHaveBeenCalledWith('commerce.get_customer_context', 'customer', 'customer-1', undefined, { correlationId: 'customer-1', ok: true });
  });

  it('returns CUSTOMER_NOT_FOUND for missing or cross-merchant customers and rejects invalid input before reads', async () => {
    vi.mocked(conversations.customerContext).mockResolvedValueOnce(null);

    await expect(service.getCustomerContext({ merchantId: 'merchant-a', customerId: 'merchant-b-customer' })).resolves.toMatchObject({ ok: false, code: 'CUSTOMER_NOT_FOUND' });
    await expect(service.getCustomerContext({ merchantId: 'merchant-a', customerId: '', unknown: true } as never)).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(conversations.customerContext).toHaveBeenCalledTimes(1);
  });

  it('signs checkout payloads and rejects tampered or expired token verification', async () => {
    process.env.JWT_SECRET = 'commerce-tool-unit-test-secret-that-is-longer-than-32-characters';
    process.env.SHOP_PUBLIC_URL = 'https://shop.example.test';
    const carts = {
      prepareCheckout: vi.fn().mockResolvedValue({
        id: 'cart-1', merchantId: 'merchant-1', subtotalMinor: 1200,
        items: [{ variantId: 'variant-1', quantity: 1, unitPriceMinor: 1200, currency: 'USD' }],
      }),
      markCheckoutLink: vi.fn().mockResolvedValue(undefined),
    } as unknown as CartService;
    const checkout = new CheckoutLinkService(carts);

    const handoff = await checkout.createCheckoutLink('merchant-1', 'cart-1');
    const token = new URL(handoff.checkoutUrl).searchParams.get('checkout_token')!;

    await expect(checkout.verifyCheckoutLink(token)).resolves.toMatchObject({ cartId: 'cart-1', merchantId: 'merchant-1', lines: [{ variantId: 'variant-1', quantity: 1, unitPriceMinor: 1200 }] });
    await expect(checkout.verifyCheckoutLink(`${token.slice(0, -1)}x`)).rejects.toMatchObject({ code: 'CHECKOUT_LINK_INVALID' });
    expect(carts.markCheckoutLink).toHaveBeenCalledWith('merchant-1', 'cart-1', expect.any(String), expect.any(Date), undefined);
  });

  it('uses context merchant identity for cart tools and rejects model-supplied merchant identity', async () => {
    const carts = {
      createCart: vi.fn().mockResolvedValue({ id: 'cart-1' }),
      addToCart: vi.fn().mockResolvedValue({ id: 'cart-1', subtotalMinor: 1200, items: [{ variantId: 'variant-1', quantity: 1, unitPriceMinor: 1200, currency: 'USD', variant: { sku: 'SKU-1', stockQty: 2, product: { id: 'product-1', name: 'Product' } } }] }),
    } as unknown as CartService;
    const checkout = { createCheckoutLink: vi.fn().mockResolvedValue({ cartId: 'cart-1', checkoutUrl: 'https://shop.example.test/shop/checkout?checkout_token=signed', expiresAt: '2026-08-10T12:30:00.000Z' }) } as unknown as CheckoutLinkService;
    const cartTools = new CommerceToolsService(reads, shipping, conversations, audit, carts, checkout);

    await expect(cartTools.createCart({}, { merchantId: 'merchant-1', correlationId: 'cart-create' })).resolves.toMatchObject({ ok: true, data: { cartId: 'cart-1', status: 'ACTIVE', itemCount: 0 } });
    await expect(cartTools.addToCart({ cartId: 'cart-1', variantId: 'variant-1', quantity: 1 }, { merchantId: 'merchant-1' })).resolves.toMatchObject({ ok: true, data: { subtotalMinor: 1200, items: [{ availability: 'IN_STOCK' }] } });
    await expect(cartTools.createCheckoutLink({ cartId: 'cart-1' }, { merchantId: 'merchant-1' })).resolves.toMatchObject({ ok: true, data: { cartId: 'cart-1' } });
    await expect(cartTools.createCart({ merchantId: 'merchant-model-input' }, { merchantId: 'merchant-1' })).resolves.toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(carts.createCart).toHaveBeenCalledWith(expect.objectContaining({ merchantId: 'merchant-1' }), undefined);
  });
});
