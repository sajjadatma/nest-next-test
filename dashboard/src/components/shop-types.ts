export type ProductImage = {
  id: string;
  url: string;
  alt: string;
  position: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceMinor: number;
  currency: string;
  imageUrl?: string | null;
  stockQty: number;
  material?: string | null;
  dimensions?: string | null;
  care?: string | null;
  featuredRank?: number | null;
  images: ProductImage[];
  averageRating: number | null;
  commentCount: number;
  isFavorite: boolean;
  category: { name: string; slug: string };
};

export type Category = {
  id?: string;
  name: string;
  slug: string;
  _count: { products: number };
};

export type ProductComment = {
  id: string;
  body: string;
  rating: number | null;
  createdAt: string;
  authorName?: string;
  author?: { name: string | null };
  user?: { name: string | null };
};

export type ShippingOption = {
  id: string;
  label: string;
  description: string;
  eta: string;
  priceMinor: number;
};

export type CartLine = Product & { quantity: number };

export const money = (minor: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    minor / 100,
  );

export type ProductArtVariant = "clay" | "sage" | "sand" | "ink" | "lichen";

const PRODUCT_ART_VARIANTS: ProductArtVariant[] = [
  "clay",
  "sage",
  "sand",
  "ink",
  "lichen",
];

/**
 * Product imagery is server data, so the client keeps every supplied URL
 * intact and lets the card handle a failed remote image. This seed makes the
 * local fallback stable per catalogue item instead of making every card look
 * identical in a restricted network.
 */
export function productArtVariant(
  product: Pick<Product, "id" | "name" | "category">,
): ProductArtVariant {
  const key = `${product.id}:${product.category.slug}:${product.name}`;
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return PRODUCT_ART_VARIANTS[(hash >>> 0) % PRODUCT_ART_VARIANTS.length];
}

export function productImages(product: Product): ProductImage[] {
  if (product.images?.length) {
    return [...product.images].sort((a, b) => a.position - b.position);
  }
  return product.imageUrl
    ? [
        {
          id: `${product.id}-primary`,
          url: product.imageUrl,
          alt: product.name,
          position: 0,
        },
      ]
    : [];
}
