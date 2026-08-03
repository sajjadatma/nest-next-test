"use client";

import Link from "next/link";
import { useCart } from "@/components/cart-provider";

export function ShopHeader() {
  const { itemCount } = useCart();
  return (
    <header className="shop-nav">
      <Link className="shop-logo" href="/shop">
        NEST<span>™</span>
      </Link>
      <nav aria-label="Shop navigation">
        <Link href="/shop#collection">Collection</Link>
        <Link href="/shop#about">Our approach</Link>
      </nav>
      <Link className="bag-button" href="/shop/bag" aria-label={`Shopping bag, ${itemCount} items`}>
        Bag <span aria-hidden="true">{itemCount}</span>
      </Link>
    </header>
  );
}

export function ShopFooter() {
  return (
    <footer className="shop-footer">
      <span>NEST™ / 2026</span>
      <span>Made for daily use.</span>
      <Link href="/login">Account</Link>
    </footer>
  );
}

export function CartNotice() {
  const { notice, dismissNotice } = useCart();
  if (!notice) return null;
  return (
    <div className="shop-notice" role="status">
      <span>{notice}</span>
      <Link href="/shop/bag">View bag</Link>
      <button onClick={dismissNotice} aria-label="Dismiss notification">×</button>
    </div>
  );
}
