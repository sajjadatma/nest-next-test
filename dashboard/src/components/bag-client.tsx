"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/cart-provider";
import { money, productImages } from "@/components/shop-types";

export function BagClient() {
  const { cart, ready, subtotalMinor, updateQuantity, removeProduct } = useCart();
  if (!ready) return <main className="bag-page" aria-busy="true"><p>Restoring your bag…</p></main>;
  if (!cart.length) return (
    <main className="bag-page bag-empty">
      <p className="shop-kicker">Your selection</p>
      <h1>Your bag is ready for something good.</h1>
      <p>Pieces you add will stay here while you explore the collection.</p>
      <Link className="shop-cta" href="/shop#collection">Explore the collection →</Link>
    </main>
  );
  return (
    <main className="bag-page">
      <header className="bag-heading"><div><p className="shop-kicker">Your selection</p><h1>Shopping bag.</h1></div><span>{cart.length} {cart.length === 1 ? "piece" : "pieces"}</span></header>
      <div className="bag-layout">
        <section className="bag-lines" aria-label="Bag items">
          {cart.map((line) => {
            const image = productImages(line)[0];
            return (
              <article className="bag-line" key={line.id}>
                <Link className="bag-line-image" href={`/shop/products/${line.slug}`}>
                  {image ? <Image src={image.url} alt="" fill unoptimized sizes="128px" /> : <span aria-hidden="true">NEST</span>}
                </Link>
                <div className="bag-line-details">
                  <div><span>{line.category.name}</span><h2><Link href={`/shop/products/${line.slug}`}>{line.name}</Link></h2><strong>{money(line.priceMinor, line.currency)}</strong></div>
                  <div className="bag-line-actions">
                    <div className="quantity" aria-label={`Quantity for ${line.name}`}>
                      <button disabled={line.quantity === 1} onClick={() => updateQuantity(line.id, Math.max(1, line.quantity - 1))} aria-label={`Decrease ${line.name} quantity`}>−</button>
                      <span aria-live="polite">{line.quantity}</span>
                      <button disabled={line.quantity >= line.stockQty} onClick={() => updateQuantity(line.id, line.quantity + 1)} aria-label={`Increase ${line.name} quantity`}>+</button>
                    </div>
                    <button className="remove-line" onClick={() => removeProduct(line.id)}>Remove</button>
                  </div>
                </div>
                <strong className="bag-line-total">{money(line.priceMinor * line.quantity, line.currency)}</strong>
              </article>
            );
          })}
        </section>
        <aside className="bag-summary" aria-labelledby="bag-summary-title">
          <p className="shop-kicker">Next step</p><h2 id="bag-summary-title">Order summary</h2>
          <dl><div><dt>Subtotal</dt><dd>{money(subtotalMinor)}</dd></div><div><dt>Delivery</dt><dd>Calculated next</dd></div></dl>
          <div className="bag-summary-total"><span>Estimated total</span><strong>{money(subtotalMinor)}</strong></div>
          <p>Choose a delivery speed and confirm your address on the next page.</p>
          <Link className="shop-primary" href="/shop/checkout">Continue to delivery →</Link>
          <Link className="continue-shopping" href="/shop#collection">← Continue shopping</Link>
        </aside>
      </div>
    </main>
  );
}
