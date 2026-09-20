"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { FavoriteButton } from "@/components/favorite-button";
import { ProductComments } from "@/components/product-comments";
import { ProductGallery } from "@/components/product-gallery";
import { money, productImages, type Product } from "@/components/shop-types";
import { api, restoreSession } from "@/lib/api";

export function ProductDetailClient({ slug }: { slug: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState("");
  const { addProduct } = useCart();

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await restoreSession();
        const result = await api<Product>(`/shop/products/${encodeURIComponent(slug)}`);
        if (active) setProduct(result);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load this product.");
      }
    }
    void load();
    return () => { active = false; };
  }, [slug]);

  if (error) return <main id="main-content" className="product-state"><p className="shop-kicker">Product details</p><h1>We couldn’t find that piece.</h1><p>{error}</p><Link className="shop-cta" href="/shop">Return to collection</Link></main>;
  if (!product) return <main id="main-content" className="product-state" aria-busy="true"><p>Loading product details…</p></main>;
  const images = productImages(product);
  return (
    <main id="main-content">
      <nav className="product-breadcrumbs" aria-label="Breadcrumb"><Link href="/shop">Shop</Link><span>/</span><Link href={`/shop?category=${product.category.slug}`}>{product.category.name}</Link><span>/</span><span aria-current="page">{product.name}</span></nav>
      <div className="product-page">
        <ProductGallery images={images} productName={product.name} />
        <section className="purchase-panel">
          <p className="shop-kicker">{product.category.name}</p>
          <div className="purchase-title"><h1>{product.name}</h1><FavoriteButton productId={product.id} productName={product.name} initialFavorite={product.isFavorite} /></div>
          {product.commentCount > 0 && <a className="purchase-rating" href="#comments-title">★ {product.averageRating?.toFixed(1)} · {product.commentCount} comments</a>}
          <strong className="purchase-price">{money(product.priceMinor, product.currency)}</strong>
          <p className="purchase-description">{product.description}</p>
          <p className={product.stockQty ? "stock-note" : "stock-note sold-out"}>{product.stockQty ? `${product.stockQty < 6 ? `Only ${product.stockQty} left · ` : ""}Ready to send` : "Currently sold out"}</p>
          <div className="purchase-actions">
            <label>Quantity<select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={!product.stockQty}>{Array.from({ length: Math.min(product.stockQty, 20) }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}</option>)}</select></label>
            <button className="shop-primary" disabled={!product.stockQty} onClick={() => addProduct(product, quantity)}>{product.stockQty ? `Add to bag · ${money(product.priceMinor * quantity, product.currency)}` : "Sold out"}</button>
          </div>
          <div className="delivery-promise"><strong>Considered delivery</strong><span>Choose standard or express delivery at checkout. Payment is collected on delivery.</span></div>
          <dl className="product-facts">
            {product.material && <div><dt>Material</dt><dd>{product.material}</dd></div>}
            {product.dimensions && <div><dt>Dimensions</dt><dd>{product.dimensions}</dd></div>}
            {product.care && <div><dt>Care</dt><dd>{product.care}</dd></div>}
          </dl>
        </section>
      </div>
      <ProductComments productId={product.id} averageRating={product.averageRating} initialCount={product.commentCount} />
      <div className="mobile-purchase-bar"><span><strong>{product.name}</strong>{money(product.priceMinor, product.currency)}</span><button disabled={!product.stockQty} onClick={() => addProduct(product, 1)}>{product.stockQty ? "Add to bag" : "Sold out"}</button></div>
    </main>
  );
}
