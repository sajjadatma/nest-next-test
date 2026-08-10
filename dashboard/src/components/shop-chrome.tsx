"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";

export function ShopHeader() {
  const { itemCount } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      requestAnimationFrame(() => toggleRef.current?.focus());
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="shop-nav" ref={headerRef}>
      <Link className="shop-logo" href="/shop" aria-label="NEST home">
        NEST<span>™</span>
      </Link>
      <nav
        id="shop-navigation"
        ref={menuRef}
        className={menuOpen ? "shop-menu is-open" : "shop-menu"}
        aria-label="Shop navigation"
      >
        <Link href="/shop#collection" onClick={closeMenu}>Collection</Link>
        <Link href="/shop#about" onClick={closeMenu}>Our approach</Link>
        <Link href="/shop/account" onClick={closeMenu}>Account</Link>
      </nav>
      <div className="shop-nav-actions">
        <Link className="bag-button" href="/shop/bag" aria-label={`Shopping bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}>
          Bag <span aria-hidden="true">{itemCount}</span>
        </Link>
        <button
          ref={toggleRef}
          className="shop-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="shop-navigation"
          aria-label={`${menuOpen ? "Close" : "Open"} navigation`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="menu-toggle-mark" aria-hidden="true" />
          <span className="menu-toggle-label">{menuOpen ? "Close" : "Menu"}</span>
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
      <button type="button" onClick={dismissNotice} aria-label="Dismiss notification">Dismiss</button>
    </div>
  );
}
