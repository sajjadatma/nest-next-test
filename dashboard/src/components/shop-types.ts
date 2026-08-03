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

function displayImage(image: ProductImage): ProductImage {
  // The starter catalogue was seeded with Unsplash URLs. Those are not
  // guaranteed to be reachable (and fail noisily in restricted networks), so
  // use the bundled shop artwork for those legacy records instead.
  if (image.url.startsWith("https://images.unsplash.com/")) {
    return { ...image, url: "/og.png" };
  }
  return image;
}

export function productImages(product: Product): ProductImage[] {
  if (product.images?.length) {
    return [...product.images]
      .sort((a, b) => a.position - b.position)
      .map(displayImage);
  }
  return product.imageUrl
    ? [
        displayImage({
          id: `${product.id}-primary`,
          url: product.imageUrl,
          alt: product.name,
          position: 0,
        }),
      ]
    : [];
}
