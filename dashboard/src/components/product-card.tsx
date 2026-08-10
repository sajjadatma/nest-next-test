"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { FavoriteButton } from "@/components/favorite-button";
import {
  money,
  productArtVariant,
  productImages,
  type Product,
} from "@/components/shop-types";

type ProductCardProps = {
  product: Product;
  onFavoriteChange?: (favorite: boolean) => void;
  compact?: boolean;
};

function ProductArt({ product, decorative = false }: { product: Product; decorative?: boolean }) {
  const variant = productArtVariant(product);
  const monogram = product.name.trim().charAt(0).toUpperCase() || "N";

  return (
    <div
      className={`product-art product-art-${variant}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${product.name}, ${product.category.name} product illustration`}
      aria-hidden={decorative || undefined}
    >
      <svg className="product-art-shapes" viewBox="0 0 320 360" aria-hidden="true">
        <circle className="product-art-orb" cx="250" cy="76" r="76" />
        <path className="product-art-arc" d="M-20 286c54-106 146-146 276-94 43 17 68 38 86 63" />
        <rect className="product-art-block" x="44" y="74" width="148" height="190" rx="74" />
        <path className="product-art-line" d="M79 129h93M79 151h66" />
      </svg>
      <span className="product-art-monogram" aria-hidden="true">{monogram}</span>
      <span className="product-art-caption" aria-hidden="true">{product.category.name}</span>
    </div>
  );
}

export function ProductCard({ product, onFavoriteChange, compact = false }: ProductCardProps) {
  const { addProduct } = useCart();
  const image = productImages(product)[0];
  const [failedImageUrl, setFailedImageUrl] = useState("");
  const [loadedImageUrl, setLoadedImageUrl] = useState("");
  const headingId = useId();
  const hasStock = product.stockQty > 0;
  const imageAvailable = Boolean(
    image && image.url !== "/og.png" && image.url !== failedImageUrl,
  );
  const imageReady = Boolean(image && image.url === loadedImageUrl && image.url !== failedImageUrl);

  return (
    <article
      className={`product-card${compact ? " compact" : ""}${hasStock ? "" : " is-sold-out"}`}
      aria-labelledby={headingId}
      data-sold-out={!hasStock || undefined}
    >
      <div className="product-image">
        <Link
          href={`/shop/products/${product.slug}`}
          aria-label={`View ${product.name}, ${product.category.name}`}
        >
          {imageAvailable ? (
            <>
              {!imageReady && <ProductArt product={product} decorative />}
              <Image
                className={imageReady ? "product-card-image is-loaded" : "product-card-image"}
                src={image.url}
                alt={image.alt.trim() || `${product.name} product image`}
                fill
                unoptimized
                sizes="(max-width: 540px) 84vw, (max-width: 850px) 50vw, 25vw"
                onLoad={() => setLoadedImageUrl(image?.url ?? "")}
                onError={() => setFailedImageUrl(image?.url ?? "")}
              />
            </>
          ) : (
            <ProductArt product={product} />
          )}
        </Link>
        <span className="product-category">{product.category.name}</span>
        {!hasStock && <span className="product-stock-badge">Sold out</span>}
        <FavoriteButton
          productId={product.id}
          productName={product.name}
          initialFavorite={product.isFavorite}
          onChange={onFavoriteChange}
        />
      </div>
      <div className="product-details">
        <div className="product-copy">
          <h3 id={headingId}>
            <Link href={`/shop/products/${product.slug}`}>{product.name}</Link>
          </h3>
          {!compact && (
            <p className="product-description">{product.description}</p>
          )}
          {product.commentCount > 0 && (
            <span
              className="product-rating"
              aria-label={`${product.averageRating ?? "No"} out of 5 rating, ${product.commentCount} comments`}
            >
              {product.averageRating?.toFixed(1) ?? "No rating"} · {product.commentCount} {product.commentCount === 1 ? "comment" : "comments"}
            </span>
          )}
        </div>
        <div className="product-bottom">
          <strong>{money(product.priceMinor, product.currency)}</strong>
          <button
            type="button"
            onClick={() => addProduct(product)}
            disabled={!hasStock}
            aria-label={hasStock ? `Add ${product.name} to bag` : `${product.name} is sold out`}
          >
            {hasStock ? "Add to bag" : "Sold out"}
          </button>
        </div>
      </div>
    </article>
  );
}
