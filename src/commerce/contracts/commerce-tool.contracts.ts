export const COMMERCE_TOOL_ERROR_CODES = [
  'TOOL_NOT_FOUND', 'INVALID_INPUT', 'UNAUTHORIZED', 'MERCHANT_MISMATCH',
  'PRODUCT_NOT_FOUND', 'VARIANT_NOT_FOUND', 'OUT_OF_STOCK', 'INSUFFICIENT_STOCK', 'CUSTOMER_NOT_FOUND',
  'PRICE_UNVERIFIABLE', 'INVENTORY_UNVERIFIABLE', 'SHIPPING_UNVERIFIABLE',
  'CART_NOT_FOUND', 'CART_EMPTY', 'CHECKOUT_LINK_EXPIRED', 'CHECKOUT_LINK_INVALID', 'CHECKOUT_LINK_UNVERIFIABLE',
  'HANDOFF_REQUIRED', 'UPSTREAM_TIMEOUT', 'UPSTREAM_ERROR', 'INTERNAL',
] as const;

export type CommerceToolErrorCode = typeof COMMERCE_TOOL_ERROR_CODES[number];

export type ToolResult<T> =
  | { ok: true; data: T; at: string }
  | { ok: false; code: CommerceToolErrorCode; message: string; at: string };

export type ToolContext = {
  correlationId?: string;
  actorId?: string;
  merchantId?: string;
  customerId?: string;
  externalUserId?: string;
  conversationId?: string;
};

export type CreateCartInput = Record<string, never>;

export type AddToCartInput = { cartId: string; variantId: string; quantity: number };

export type CreateCheckoutLinkInput = { cartId: string };

export type CartSummaryItem = {
  variantId: string;
  productId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
  availability: 'IN_STOCK' | 'OUT_OF_STOCK';
};

export type CreateCartData = { cartId: string; status: 'ACTIVE'; itemCount: 0; items: []; at: string };

export type AddToCartData = { cartId: string; items: CartSummaryItem[]; itemCount: number; subtotalMinor: number; at: string };

export type CreateCheckoutLinkData = { checkoutUrl: string; expiresAt: string; cartId: string; at: string };

export type SearchProductsInput = {
  merchantId: string;
  query?: string;
  category?: string;
  attributes?: Record<string, string>;
  size?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  limit?: number;
};

export type GetProductInput = {
  merchantId: string;
  productId: string;
};

export type CheckInventoryInput = {
  merchantId: string;
  variantId: string;
};

export type GetPriceInput = CheckInventoryInput;

export type GetProductImagesInput = GetProductInput;

export type CompareProductsInput = {
  merchantId: string;
  productIds: string[];
};

export type GetShippingEstimateInput = {
  merchantId: string;
};

export type GetCustomerContextInput = {
  merchantId: string;
  customerId: string;
};

export type ProductCard = {
  productId: string;
  variantId: string;
  slug: string;
  title: string;
  description?: string;
  category: { name: string; slug: string };
  priceMinor: number;
  currency: string;
  availability: 'IN_STOCK' | 'OUT_OF_STOCK';
  imageUrl?: string;
  productUrl: string;
  canonicalAttributes: Record<string, unknown> | null;
};

export type SearchProductsData = {
  matched: boolean;
  reason?: 'NO_MATCH' | 'OUT_OF_STOCK';
  items: ProductCard[];
};

export type ProductDetail = {
  productId: string;
  slug: string;
  title: string;
  description: string;
  category: { name: string; slug: string };
  images: Array<{ url: string; alt: string; position: number }>;
  defaultVariant: {
    variantId: string;
    sku: string;
    color: string | null;
    size: string | null;
    canonicalAttributes: Record<string, unknown> | null;
    priceMinor: number;
    currency: string;
    stockQty: number;
    availability: 'IN_STOCK' | 'OUT_OF_STOCK';
    isDefault: boolean;
  };
  availability: 'IN_STOCK' | 'OUT_OF_STOCK';
  productUrl: string;
};

export type InventoryData = {
  variantId: string;
  productId: string;
  sku: string;
  stockQty: number;
  availability: 'IN_STOCK' | 'OUT_OF_STOCK';
  at: string;
};

export type PriceData = {
  variantId: string;
  productId: string;
  priceMinor: number;
  currency: string;
  updatedAt: string;
  at: string;
};

export type ProductImagesData = {
  productId: string;
  images: Array<{ id: string; url: string; alt: string; position: number }>;
  at: string;
};

export type CompareProductsData = {
  items: Array<{
    productId: string;
    variantId: string;
    slug: string;
    title: string;
    priceMinor: number;
    currency: string;
    availability: 'IN_STOCK' | 'OUT_OF_STOCK';
    imageUrl?: string;
    canonicalAttributes: Record<string, unknown> | null;
  }>;
  at: string;
};

export type ShippingEstimateData = {
  methods: Array<{ id: string; label: string; description?: string; eta: string; priceMinor: number }>;
  at: string;
};

export type CustomerContextData = {
  customerId: string;
  hasUserAccount: boolean;
  conversationCount: number;
  orderCount: number;
  at: string;
};
