"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart-provider";

export function ShopHeader() {
  const { itemCount } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="shop-nav">
      <Link className="shop-logo" href="/shop">
        NEST<span>™</span>
      </Link>
      <nav id="shop-navigation" className={menuOpen ? "shop-menu is-open" : "shop-menu"} aria-label="Shop navigation">
        <Link href="/shop#collection" onClick={() => setMenuOpen(false)}>Collection</Link>
        <Link href="/shop#about" onClick={() => setMenuOpen(false)}>Our approach</Link>
        <Link href="/shop/account" onClick={() => setMenuOpen(false)}>Account</Link>
      </nav>
      <div className="shop-nav-actions">
        <Link className="bag-button" href="/shop/bag" aria-label={`Shopping bag, ${itemCount} items`}>
          Bag <span aria-hidden="true">{itemCount}</span>
        </Link>
        <button className="shop-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="shop-navigation" onClick={() => setMenuOpen((open) => !open)}>
          <span className="sr-only">{menuOpen ? "Close" : "Open"} navigation</span>
          <span aria-hidden="true">{menuOpen ? "×" : "Menu"}</span>
        </button>
      </div>
    </header>
  );
}

export function ShopFooter() {
  return (
    <footer className="shop-footer">
      <span>NEST™ / 2026</span>
      <span>Made for daily use.</span>
      <Link href="/login?redirect=%2Fshop%2Faccount">Account</Link>
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
