import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { ConversationService } from '../conversations/conversation.service';
import {
  AddToCartData,
  AddToCartInput,
  CheckInventoryInput,
  CommerceToolErrorCode,
  CompareProductsData,
  CompareProductsInput,
  CreateCartData,
  CreateCheckoutLinkData,
  CreateCheckoutLinkInput,
  CustomerContextData,
  GetCustomerContextInput,
  GetProductImagesInput,
  GetProductInput,
  GetPriceInput,
  GetShippingEstimateInput,
  InventoryData,
  PriceData,
  ProductCard,
  ProductDetail,
  ProductImagesData,
  SearchProductsData,
  SearchProductsInput,
  ShippingEstimateData,
  ToolContext,
  ToolResult,
} from './contracts/commerce-tool.contracts';
import { CartError, CartService } from './cart/cart.service';
import { CheckoutLinkError, CheckoutLinkService } from './checkout/checkout-link.service';
import { ShippingReadService } from './shipping/shipping-read.service';
import { VariantReadService } from './variants/variant-read.service';

type ToolName = 'search_products' | 'get_product' | 'check_inventory' | 'get_price' | 'get_product_images' | 'compare_products' | 'get_shipping_estimate' | 'get_customer_context' | 'create_cart' | 'add_to_cart' | 'create_checkout_link';

class ToolTimeoutError extends Error {}

@Injectable()
export class CommerceToolsService {
  constructor(
    private readonly variants: VariantReadService,
    private readonly shipping: ShippingReadService,
    private readonly conversations: ConversationService,
    private readonly audit: AuditService,
    private readonly carts?: CartService,
    private readonly checkoutLinks?: CheckoutLinkService,
  ) {}

  async searchProducts(input: unknown, context: ToolContext = {}): Promise<ToolResult<SearchProductsData>> {
    return this.execute('search_products', input, context, async () => {
      const parsed = this.parseSearchProducts(input);
      if (!parsed.ok) return parsed;
      try {
        const result = await this.withReadTimeout(this.variants.search(parsed.data));
        const items: ProductCard[] = result.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          slug: item.slug,
          title: item.title,
          description: item.description || undefined,
          category: item.category,
          priceMinor: item.priceMinor,
          currency: item.currency,
          availability: item.availability,
          imageUrl: item.imageUrl,
          productUrl: `/shop/products/${item.slug}`,
          canonicalAttributes: item.canonicalAttributes,
        }));
        return this.success({
          matched: result.matched,
          ...(result.matched ? {} : { reason: result.availability === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' as const : 'NO_MATCH' as const }),
          items,
        });
      } catch (error) {
        return this.readFailure<SearchProductsData>(error, 'PRICE_UNVERIFIABLE', 'Product prices could not be verified.');
      }
    });
  }

  async getProduct(input: unknown, context: ToolContext = {}): Promise<ToolResult<ProductDetail>> {
    return this.execute('get_product', input, context, async () => {
      const parsed = this.parseGetProduct(input);
      if (!parsed.ok) return parsed;
      try {
        const product = await this.withReadTimeout(this.variants.productDetail(parsed.data.merchantId, parsed.data.productId));
        if (!product) return this.failure('PRODUCT_NOT_FOUND', 'Product was not found for this merchant.');
        if (!product.defaultVariant) return this.failure('INVENTORY_UNVERIFIABLE', 'Product inventory could not be verified.');
        if (product.defaultVariant.priceMinor < 0 || !product.defaultVariant.currency) return this.failure('PRICE_UNVERIFIABLE', 'Product prices could not be verified.');
        return this.success({
          productId: product.productId,
          slug: product.slug,
          title: product.title,
          description: product.description,
          category: product.category,
          images: product.images.map(({ url, alt, position }) => ({ url, alt, position })),
          defaultVariant: product.defaultVariant,
          availability: product.availability ?? product.defaultVariant.availability,
          productUrl: `/shop/products/${product.slug}`,
        });
      } catch (error) {
        return this.readFailure<ProductDetail>(error, 'INVENTORY_UNVERIFIABLE', 'Product inventory could not be verified.');
      }
    });
  }

  async checkInventory(input: unknown, context: ToolContext = {}): Promise<ToolResult<InventoryData>> {
    return this.execute('check_inventory', input, context, async () => {
      const parsed = this.parseVariantInput<CheckInventoryInput>(input);
      if (!parsed.ok) return parsed;
      try {
        const variant = await this.withReadTimeout(this.variants.variantDetail(parsed.data.merchantId, parsed.data.variantId));
        if (!variant) return this.failure('VARIANT_NOT_FOUND', 'Variant was not found for this merchant.');
        if (variant.stockQty < 0) return this.failure('INVENTORY_UNVERIFIABLE', 'Variant inventory could not be verified.');
        return this.success({
          variantId: variant.variantId,
          productId: variant.productId,
          sku: variant.sku,
          stockQty: variant.stockQty,
          availability: variant.availability,
          at: new Date().toISOString(),
        });
      } catch (error) {
        return this.readFailure<InventoryData>(error, 'INVENTORY_UNVERIFIABLE', 'Variant inventory could not be verified.');
      }
    });
  }

  async getPrice(input: unknown, context: ToolContext = {}): Promise<ToolResult<PriceData>> {
    return this.execute('get_price', input, context, async () => {
      const parsed = this.parseVariantInput<GetPriceInput>(input);
      if (!parsed.ok) return parsed;
      try {
        const variant = await this.withReadTimeout(this.variants.variantDetail(parsed.data.merchantId, parsed.data.variantId));
        if (!variant) return this.failure('VARIANT_NOT_FOUND', 'Variant was not found for this merchant.');
        if (variant.priceMinor < 0 || !variant.currency) return this.failure('PRICE_UNVERIFIABLE', 'Variant price could not be verified.');
        return this.success({
          variantId: variant.variantId,
          productId: variant.productId,
          priceMinor: variant.priceMinor,
          currency: variant.currency,
          updatedAt: variant.updatedAt,
          at: new Date().toISOString(),
        });
      } catch (error) {
        return this.readFailure<PriceData>(error, 'PRICE_UNVERIFIABLE', 'Variant price could not be verified.');
      }
    });
  }

  async getProductImages(input: unknown, context: ToolContext = {}): Promise<ToolResult<ProductImagesData>> {
    return this.execute('get_product_images', input, context, async () => {
      const parsed = this.parseGetProduct(input) as ToolResult<GetProductImagesInput>;
      if (!parsed.ok) return parsed;
      try {
        const product = await this.withReadTimeout(this.variants.productDetail(parsed.data.merchantId, parsed.data.productId));
        if (!product) return this.failure('PRODUCT_NOT_FOUND', 'Product was not found for this merchant.');
        return this.success({ productId: product.productId, images: product.images, at: new Date().toISOString() });
      } catch {
        return this.failure('INTERNAL', 'Product images could not be read safely.');
      }
    });
  }

  async compareProducts(input: unknown, context: ToolContext = {}): Promise<ToolResult<CompareProductsData>> {
    return this.execute('compare_products', input, context, async () => {
      const parsed = this.parseCompareProducts(input);
      if (!parsed.ok) return parsed;
      try {
        const variants = await this.withReadTimeout(this.variants.compare(parsed.data.merchantId, parsed.data.productIds));
        if (!variants) return this.failure('PRODUCT_NOT_FOUND', 'One or more products were not found for this merchant.');
        return this.success({
          items: variants.map((variant) => ({
            productId: variant.productId,
            variantId: variant.variantId,
            slug: variant.slug,
            title: variant.title,
            priceMinor: variant.priceMinor,
            currency: variant.currency,
            availability: variant.availability,
            imageUrl: variant.imageUrl,
            canonicalAttributes: variant.canonicalAttributes,
          })),
          at: new Date().toISOString(),
        });
      } catch {
        return this.failure('INTERNAL', 'Products could not be compared safely.');
      }
    });
  }

  async getShippingEstimate(input: unknown, context: ToolContext = {}): Promise<ToolResult<ShippingEstimateData>> {
    return this.execute('get_shipping_estimate', input, context, async () => {
      const parsed = this.parseShippingEstimate(input);
      if (!parsed.ok) return parsed;
      try {
        const methods = await this.withReadTimeout(this.shipping.availableMethods());
        return this.success({ methods, at: new Date().toISOString() });
      } catch {
        return this.failure('SHIPPING_UNVERIFIABLE', 'Shipping methods could not be verified.');
      }
    });
  }

  async getCustomerContext(input: unknown, context: ToolContext = {}): Promise<ToolResult<CustomerContextData>> {
    return this.execute('get_customer_context', input, context, async () => {
      const parsed = this.parseCustomerContext(input);
      if (!parsed.ok) return parsed;
      try {
        const customer = await this.withReadTimeout(this.conversations.customerContext(parsed.data.merchantId, parsed.data.customerId));
        if (!customer) return this.failure('CUSTOMER_NOT_FOUND', 'Customer was not found for this merchant.');
        return this.success({ ...customer, at: new Date().toISOString() });
      } catch {
        return this.failure('INTERNAL', 'Customer context could not be read safely.');
      }
    });
  }

  async createCart(input: unknown, context: ToolContext = {}): Promise<ToolResult<CreateCartData>> {
    return this.execute('create_cart', input, context, async () => {
      if (!this.emptyInput(input) || !context.merchantId || !this.carts) return this.failure('INVALID_INPUT', 'Tool input is invalid.');
      try {
        const cart = await this.carts.createCart({ merchantId: context.merchantId, customerId: context.customerId, externalUserId: context.externalUserId, conversationId: context.conversationId }, context.actorId);
        return this.success({ cartId: cart.id, status: 'ACTIVE', itemCount: 0, items: [], at: new Date().toISOString() });
      } catch {
        return this.failure('INTERNAL', 'Cart could not be created safely.');
      }
    });
  }

  async addToCart(input: unknown, context: ToolContext = {}): Promise<ToolResult<AddToCartData>> {
    return this.execute('add_to_cart', input, context, async () => {
      const parsed = this.parseAddToCart(input);
      if (!parsed.ok) return parsed;
      if (!context.merchantId || !this.carts) return this.failure('INVALID_INPUT', 'Tool context is invalid.');
      try {
        const cart = await this.carts.addToCart({ merchantId: context.merchantId, ...parsed.data }, context.actorId);
        const items = cart.items.map((item) => ({
          variantId: item.variantId, productId: item.variant.product.id, sku: item.variant.sku, title: item.variant.product.name,
          quantity: item.quantity, unitPriceMinor: item.unitPriceMinor, currency: item.currency,
          availability: item.variant.stockQty >= item.quantity ? 'IN_STOCK' as const : 'OUT_OF_STOCK' as const,
        }));
        return this.success({ cartId: cart.id, items, itemCount: items.reduce((total, item) => total + item.quantity, 0), subtotalMinor: cart.subtotalMinor, at: new Date().toISOString() });
      } catch (error) {
        return this.cartFailure<AddToCartData>(error);
      }
    });
  }

  async createCheckoutLink(input: unknown, context: ToolContext = {}): Promise<ToolResult<CreateCheckoutLinkData>> {
    return this.execute('create_checkout_link', input, context, async () => {
      const parsed = this.parseCheckoutLink(input);
      if (!parsed.ok) return parsed;
      if (!context.merchantId || !this.checkoutLinks) return this.failure('INVALID_INPUT', 'Tool context is invalid.');
      try {
        const link = await this.checkoutLinks.createCheckoutLink(context.merchantId, parsed.data.cartId, context.actorId);
        return this.success({ ...link, at: new Date().toISOString() });
      } catch (error) {
        return this.cartFailure<CreateCheckoutLinkData>(error);
      }
    });
  }

  private async execute<T>(tool: ToolName, input: unknown, context: ToolContext, operation: () => Promise<ToolResult<T>>): Promise<ToolResult<T>> {
    let result: ToolResult<T>;
    try {
      result = await operation();
    } catch {
      result = this.failure('INTERNAL', 'The commerce tool could not complete safely.');
    }
    const metadata = {
      correlationId: context.correlationId,
      ok: result.ok,
      ...(result.ok ? {} : { code: result.code }),
    };
    try {
      await this.audit.record(`commerce.${tool}`, this.auditTargetType(tool), this.auditTargetId(tool, input), context.actorId, metadata);
      return result;
    } catch {
      return this.failure('INTERNAL', 'The commerce tool could not complete safely.');
    }
  }

  private async withReadTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => { timeout = setTimeout(() => reject(new ToolTimeoutError()), 1_500); }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private readFailure<T>(error: unknown, fallback: Extract<CommerceToolErrorCode, 'PRICE_UNVERIFIABLE' | 'INVENTORY_UNVERIFIABLE'>, message: string): ToolResult<T> {
    if (error instanceof ToolTimeoutError) return this.failure('UPSTREAM_TIMEOUT', 'The commerce source did not respond in time.');
    return this.failure(fallback, message);
  }

  private parseSearchProducts(input: unknown): ToolResult<SearchProductsInput> {
    const value = this.object(input);
    const allowed = ['merchantId', 'query', 'category', 'attributes', 'size', 'budgetMin', 'budgetMax', 'currency', 'limit'];
    if (!value || !this.onlyAllowed(value, allowed) || !this.requiredString(value.merchantId)
      || !this.optionalString(value.query) || !this.optionalString(value.category) || !this.optionalString(value.size) || !this.optionalString(value.currency)
      || !this.attributes(value.attributes) || !this.optionalNonNegativeInteger(value.budgetMin) || !this.optionalNonNegativeInteger(value.budgetMax)
      || !this.optionalLimit(value.limit) || (typeof value.budgetMin === 'number' && typeof value.budgetMax === 'number' && value.budgetMin > value.budgetMax)) {
      return this.failure('INVALID_INPUT', 'Tool input is invalid.');
    }
    return this.success(value as SearchProductsInput);
  }

  private parseGetProduct(input: unknown): ToolResult<GetProductInput> {
    const value = this.object(input);
    if (!value || !this.onlyAllowed(value, ['merchantId', 'productId']) || !this.requiredString(value.merchantId) || !this.requiredString(value.productId)) {
      return this.failure('INVALID_INPUT', 'Tool input is invalid.');
    }
    return this.success(value as GetProductInput);
  }

  private parseVariantInput<T extends CheckInventoryInput>(input: unknown): ToolResult<T> {
    const value = this.object(input);
    if (!value || !this.onlyAllowed(value, ['merchantId', 'variantId']) || !this.requiredString(value.merchantId) || !this.requiredString(value.variantId)) {
      return this.failure('INVALID_INPUT', 'Tool input is invalid.');
    }
    return this.success(value as T);
  }

  private parseCompareProducts(input: unknown): ToolResult<CompareProductsInput> {
    const value = this.object(input);
    if (!value || !this.onlyAllowed(value, ['merchantId', 'productIds']) || !this.requiredString(value.merchantId)
      || !Array.isArray(value.productIds) || value.productIds.length < 2 || value.productIds.length > 4
      || value.productIds.some((productId) => !this.requiredString(productId)) || new Set(value.productIds).size !== value.productIds.length) {
      return this.failure('INVALID_INPUT', 'Tool input is invalid.');
    }
    return this.success(value as CompareProductsInput);
  }

  private parseShippingEstimate(input: unknown): ToolResult<GetShippingEstimateInput> {
    const value = this.object(input);
    if (!value || !this.onlyAllowed(value, ['merchantId']) || !this.requiredString(value.merchantId)) {
      return this.failure('INVALID_INPUT', 'Tool input is invalid.');
    }
    return this.success(value as GetShippingEstimateInput);
  }

  private parseCustomerContext(input: unknown): ToolResult<GetCustomerContextInput> {
    const value = this.object(input);
    if (!value || !this.onlyAllowed(value, ['merchantId', 'customerId']) || !this.requiredString(value.merchantId) || !this.requiredString(value.customerId)) {
      return this.failure('INVALID_INPUT', 'Tool input is invalid.');
    }
    return this.success(value as GetCustomerContextInput);
  }

  private parseAddToCart(input: unknown): ToolResult<AddToCartInput> {
    const value = this.object(input);
    if (!value || !this.onlyAllowed(value, ['cartId', 'variantId', 'quantity']) || !this.requiredString(value.cartId)
      || !this.requiredString(value.variantId) || typeof value.quantity !== 'number' || !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 20) {
      return this.failure('INVALID_INPUT', 'Tool input is invalid.');
    }
    return this.success(value as AddToCartInput);
  }

  private parseCheckoutLink(input: unknown): ToolResult<CreateCheckoutLinkInput> {
    const value = this.object(input);
    if (!value || !this.onlyAllowed(value, ['cartId']) || !this.requiredString(value.cartId)) return this.failure('INVALID_INPUT', 'Tool input is invalid.');
    return this.success(value as CreateCheckoutLinkInput);
  }

  private object(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
  }

  private emptyInput(value: unknown) {
    const object = this.object(value);
    return object !== null && Object.keys(object).length === 0;
  }

  private cartFailure<T>(error: unknown): ToolResult<T> {
    if (error instanceof CartError || error instanceof CheckoutLinkError) return this.failure(error.code, error.message);
    return this.failure('INTERNAL', 'Cart operation could not complete safely.');
  }

  private onlyAllowed(value: Record<string, unknown>, allowed: string[]) {
    return Object.keys(value).every((key) => allowed.includes(key));
  }

  private requiredString(value: unknown) { return typeof value === 'string' && value.trim().length > 0; }
  private optionalString(value: unknown) { return value === undefined || this.requiredString(value); }
  private optionalNonNegativeInteger(value: unknown) { return value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0); }
  private optionalLimit(value: unknown) { return value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10); }

  private attributes(value: unknown) {
    if (value === undefined) return true;
    const attributes = this.object(value);
    return attributes !== null && Object.values(attributes).every((attribute) => this.requiredString(attribute));
  }

  private auditTargetType(tool: ToolName) {
    return tool === 'search_products' || tool === 'compare_products' || tool === 'get_shipping_estimate'
      ? 'merchant'
      : tool === 'get_product' || tool === 'get_product_images' ? 'product' : tool === 'get_customer_context' ? 'customer' : tool === 'create_cart' || tool === 'add_to_cart' || tool === 'create_checkout_link' ? 'cart' : 'variant';
  }

  private auditTargetId(tool: ToolName, input: unknown) {
    const value = this.object(input);
    if (tool === 'search_products' || tool === 'compare_products' || tool === 'get_shipping_estimate') return typeof value?.merchantId === 'string' ? value.merchantId : undefined;
    if (tool === 'create_cart') return undefined;
    if (tool === 'add_to_cart' || tool === 'create_checkout_link') return typeof value?.cartId === 'string' ? value.cartId : undefined;
    if (tool === 'get_product' || tool === 'get_product_images') return typeof value?.productId === 'string' ? value.productId : undefined;
    if (tool === 'get_customer_context') return typeof value?.customerId === 'string' ? value.customerId : undefined;
    return typeof value?.variantId === 'string' ? value.variantId : undefined;
  }

  private success<T>(data: T): ToolResult<T> { return { ok: true, data, at: new Date().toISOString() }; }
  private failure<T>(code: CommerceToolErrorCode, message: string): ToolResult<T> { return { ok: false, code, message, at: new Date().toISOString() }; }
}
