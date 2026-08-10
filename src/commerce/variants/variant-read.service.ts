import { Injectable } from '@nestjs/common';
import { VariantRepository, VariantSearchCriteria } from './variant.repository';

export type VariantAvailability = 'IN_STOCK' | 'OUT_OF_STOCK';

export type VariantSearchItem = {
  variantId: string;
  productId: string;
  slug: string;
  title: string;
  description: string;
  category: { name: string; slug: string };
  sku: string;
  color: string | null;
  size: string | null;
  canonicalAttributes: Record<string, unknown> | null;
  priceMinor: number;
  currency: string;
  stockQty: number;
  availability: VariantAvailability;
  isDefault: boolean;
  updatedAt: string;
  imageUrl?: string;
};

export type VariantSearchResult = {
  matched: boolean;
  availability: VariantAvailability | null;
  items: VariantSearchItem[];
};

export type VariantProductDetail = {
  productId: string;
  slug: string;
  title: string;
  description: string;
  category: { name: string; slug: string };
  images: Array<{ id: string; url: string; alt: string; position: number }>;
  defaultVariant: Omit<VariantSearchItem, 'productId' | 'slug' | 'title' | 'description' | 'category' | 'updatedAt' | 'imageUrl'> | null;
  availability: VariantAvailability | null;
};

@Injectable()
export class VariantReadService {
  constructor(private readonly variants: VariantRepository) {}

  async search(criteria: VariantSearchCriteria): Promise<VariantSearchResult> {
    const variants = await this.variants.findMatching(criteria);
    const items = variants.map((variant): VariantSearchItem => this.toSearchItem(variant));
    const availability = items.length === 0
      ? null
      : items.some((item) => item.availability === 'IN_STOCK') ? 'IN_STOCK' : 'OUT_OF_STOCK';

    return { matched: items.length > 0, availability, items };
  }

  async productDetail(merchantId: string, productId: string): Promise<VariantProductDetail | null> {
    const product = await this.variants.findByProductId(merchantId, productId);
    if (!product) return null;
    const variant = product.defaultVariant;
    const availability = variant ? (variant.stockQty > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK') : null;
    return {
      productId: product.id,
      slug: product.slug,
      title: product.name,
      description: product.description,
      category: product.category,
      images: product.images,
      defaultVariant: variant ? {
        variantId: variant.id,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        canonicalAttributes: this.canonicalAttributes(variant.otherAttributes),
        priceMinor: variant.priceMinor,
        currency: variant.currency,
        stockQty: variant.stockQty,
        availability: availability ?? 'OUT_OF_STOCK',
        isDefault: variant.isDefault,
      } : null,
      availability,
    };
  }

  async variantDetail(merchantId: string, variantId: string): Promise<VariantSearchItem | null> {
    const variant = await this.variants.findByVariantId(merchantId, variantId);
    return variant ? this.toSearchItem(variant) : null;
  }

  async compare(merchantId: string, productIds: string[]): Promise<VariantSearchItem[] | null> {
    const variants = await this.variants.findByProductIds(merchantId, productIds);
    const foundProductIds = new Set(variants.map((variant) => variant.productId));
    if (productIds.some((productId) => !foundProductIds.has(productId))) return null;
    const productOrder = new Map(productIds.map((productId, index) => [productId, index]));
    return variants
      .map((variant) => this.toSearchItem(variant))
      .sort((left, right) => productOrder.get(left.productId)! - productOrder.get(right.productId)!
        || left.priceMinor - right.priceMinor
        || left.sku.localeCompare(right.sku));
  }

  private toSearchItem(variant: Awaited<ReturnType<VariantRepository['findMatching']>>[number]): VariantSearchItem {
    return {
      variantId: variant.id,
      productId: variant.productId,
      slug: variant.product.slug,
      title: variant.product.name,
      description: variant.product.description,
      category: variant.product.category,
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      canonicalAttributes: this.canonicalAttributes(variant.otherAttributes),
      priceMinor: variant.priceMinor,
      currency: variant.currency,
      stockQty: variant.stockQty,
      availability: variant.stockQty > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
      isDefault: variant.isDefault,
      updatedAt: variant.updatedAt.toISOString(),
      imageUrl: variant.product.images[0]?.url,
    };
  }

  private canonicalAttributes(attributes: unknown): Record<string, unknown> | null {
    if (!attributes || Array.isArray(attributes) || typeof attributes !== 'object') return null;
    return attributes as Record<string, unknown>;
  }
}
