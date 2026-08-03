"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/cart-provider";
import { FavoriteButton } from "@/components/favorite-button";
import { money, productImages, type Product } from "@/components/shop-types";

type ProductCardProps = {
  product: Product;
  onFavoriteChange?: (favorite: boolean) => void;
  compact?: boolean;
};

export function ProductCard({ product, onFavoriteChange, compact = false }: ProductCardProps) {
  const { addProduct } = useCart();
  const image = productImages(product)[0];
  return (
    <article className={`product-card${compact ? " compact" : ""}`}>
      <div className="product-image">
        <Link href={`/shop/products/${product.slug}`} aria-label={`View ${product.name}`}>
          {image ? (
            <Image
              src={image.url}
              alt={image.alt || product.name}
              fill
              unoptimized
              sizes="(max-width: 540px) 100vw, (max-width: 850px) 50vw, 25vw"
            />
          ) : (
            <span className="product-image-placeholder" aria-hidden="true">NEST</span>
          )}
        </Link>
        <span className="product-category">{product.category.name}</span>
        <FavoriteButton
          productId={product.id}
          productName={product.name}
          initialFavorite={product.isFavorite}
          onChange={onFavoriteChange}
        />
      </div>
      <div className="product-details">
        <div>
          <h3><Link href={`/shop/products/${product.slug}`}>{product.name}</Link></h3>
          {!compact && <p>{product.description}</p>}
          {product.commentCount > 0 && (
            <span className="product-rating" aria-label={`${product.averageRating ?? 0} out of 5 stars, ${product.commentCount} comments`}>
              ★ {product.averageRating?.toFixed(1)} · {product.commentCount}
            </span>
          )}
        </div>
        <div className="product-bottom">
          <strong>{money(product.priceMinor, product.currency)}</strong>
          <button onClick={() => addProduct(product)} disabled={!product.stockQty}>
            {product.stockQty ? "Add to bag" : "Sold out"}
          </button>
        </div>
      </div>
    </article>
  );
}
