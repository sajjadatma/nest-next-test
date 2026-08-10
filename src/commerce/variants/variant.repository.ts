import { Injectable } from '@nestjs/common';
import { Prisma, ProductVariant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type VariantSearchCriteria = {
  merchantId: string;
  query?: string;
  category?: string;
  color?: string;
  size?: string;
  attributes?: Record<string, string>;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  limit?: number;
};

export type VariantRecord = ProductVariant & {
  product: {
    id: string;
    slug: string;
    name: string;
    description: string;
    isActive: boolean;
    category: { name: string; slug: string };
    images: Array<{ id: string; url: string; alt: string; position: number }>;
  };
};

export type VariantProductRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: { name: string; slug: string };
  images: Array<{ id: string; url: string; alt: string; position: number }>;
  defaultVariant: ProductVariant | null;
};

@Injectable()
export class VariantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMatching(criteria: VariantSearchCriteria): Promise<VariantRecord[]> {
    const variants = await this.prisma.productVariant.findMany({
      where: {
        product: {
          merchantId: criteria.merchantId,
          isActive: true,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            isActive: true,
            category: { select: { name: true, slug: true } },
            images: { select: { id: true, url: true, alt: true, position: true }, orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: [
        { priceMinor: 'asc' },
        { sku: 'asc' },
      ],
    });

    return variants
      .filter((variant) => this.matches(variant, criteria))
      .sort((left, right) => this.relevance(left, criteria.query) - this.relevance(right, criteria.query)
        || left.priceMinor - right.priceMinor
        || left.sku.localeCompare(right.sku))
      .slice(0, criteria.limit ?? 10);
  }

  findByProductId(merchantId: string, productId: string): Promise<VariantProductRecord | null> {
    return this.prisma.product.findFirst({
      where: { id: productId, merchantId, isActive: true },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: { select: { name: true, slug: true } },
        images: { select: { id: true, url: true, alt: true, position: true }, orderBy: { position: 'asc' } },
        defaultVariant: true,
      },
    });
  }

  findByVariantId(merchantId: string, variantId: string): Promise<VariantRecord | null> {
    return this.prisma.productVariant.findFirst({
      where: { id: variantId, product: { merchantId, isActive: true } },
      include: {
        product: {
          select: {
            id: true, slug: true, name: true, description: true, isActive: true,
            category: { select: { name: true, slug: true } },
            images: { select: { id: true, url: true, alt: true, position: true }, orderBy: { position: 'asc' } },
          },
        },
      },
    });
  }

  findByProductIds(merchantId: string, productIds: string[]): Promise<VariantRecord[]> {
    return this.prisma.productVariant.findMany({
      where: { productId: { in: productIds }, product: { merchantId, isActive: true } },
      include: {
        product: {
          select: {
            id: true, slug: true, name: true, description: true, isActive: true,
            category: { select: { name: true, slug: true } },
            images: { select: { id: true, url: true, alt: true, position: true }, orderBy: { position: 'asc' } },
          },
        },
      },
      orderBy: [{ priceMinor: 'asc' }, { sku: 'asc' }],
    });
  }

  private matches(variant: ProductVariant, criteria: VariantSearchCriteria) {
    return this.matchesQuery(variant, criteria.query)
      && this.matchesCategory(variant as VariantRecord, criteria.category)
      && this.matchesValue(variant.color, criteria.color)
      && this.matchesValue(variant.size, criteria.size)
      && Object.entries(criteria.attributes ?? {}).every(([key, value]) => this.matchesValue(this.attributeValue(variant.otherAttributes, key), value))
      && (criteria.budgetMin === undefined || variant.priceMinor >= criteria.budgetMin)
      && (criteria.budgetMax === undefined || variant.priceMinor <= criteria.budgetMax)
      && this.matchesValue(variant.currency, criteria.currency);
  }

  private matchesQuery(variant: ProductVariant, query: string | undefined) {
    if (query === undefined) return true;
    return [
      (variant as VariantRecord).product.name,
      (variant as VariantRecord).product.slug,
      (variant as VariantRecord).product.description,
      variant.color,
      variant.size,
      ...this.attributeValues(variant.otherAttributes),
    ].some((value) => this.matchesValue(value, query));
  }

  private matchesCategory(variant: VariantRecord, category: string | undefined) {
    if (category === undefined) return true;
    return this.matchesValue(variant.product.category.name, category) || this.matchesValue(variant.product.category.slug, category);
  }

  private relevance(variant: VariantRecord, query: string | undefined) {
    if (query === undefined) return 0;
    const expected = this.normalized(query);
    const values = [variant.product.name, variant.product.slug, variant.product.description, variant.color, variant.size, ...this.attributeValues(variant.otherAttributes)];
    if (values.some((value) => this.normalized(value) === expected)) return 0;
    if (values.some((value) => this.normalized(value).startsWith(expected))) return 1;
    return 2;
  }

  private matchesValue(candidate: string | null | undefined, expected: string | undefined) {
    if (expected === undefined) return true;
    if (candidate === null || candidate === undefined) return false;
    return this.normalized(candidate).includes(this.normalized(expected));
  }

  private normalized(value: string | null | undefined) {
    return value?.trim().toLocaleLowerCase() ?? '';
  }

  private attributeValue(attributes: Prisma.JsonValue | null, key: string) {
    if (!attributes || Array.isArray(attributes) || typeof attributes !== 'object') return undefined;
    const value = attributes[key];
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;
  }

  private attributeValues(attributes: Prisma.JsonValue | null) {
    if (!attributes || Array.isArray(attributes) || typeof attributes !== 'object') return [];
    return Object.values(attributes).flatMap((value) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? [String(value)] : []);
  }
}
