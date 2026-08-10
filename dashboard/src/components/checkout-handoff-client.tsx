"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckoutClient } from "@/components/checkout-client";
import { useCart } from "@/components/cart-provider";
import { api, restoreSession } from "@/lib/api";
import type { CartLine, Product } from "@/components/shop-types";

/**
 * Checkout handoff continuation UI (MVP1-F02).
 *
 * Reads a signed handoff token from the shop checkout URL
 * (`/shop/checkout?checkout_token=…`), verifies it against
 * `GET /api/checkout/handoff/:token`, and either:
 *  - seeds the existing cart with the verified current items once and renders
 *    the existing {@link CheckoutClient}, or
 *  - renders a reason-specific recovery screen (EXPIRED / INVALID /
 *    OUT_OF_STOCK / PRICE_CHANGED / EMPTY) with Persian + English copy.
 *
 * The client never trusts snapshot values; it only displays the verified
 * current values returned by the API and the existing checkout re-quotes
 * before order creation.
 */

const MERCHANT_ID = "default";

// Mirrors the Persian-range detector used by the assistant chat so recovery
// copy can flip to RTL when the visitor's browser language is Persian.
const PERSIAN_RANGE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

function detectPersian(): boolean {
  if (typeof navigator === "undefined") return false;
  const languages = (navigator.languages ?? [navigator.language]).filter(Boolean) as string[];
  return languages.some((lang) => lang.toLowerCase().startsWith("fa") || PERSIAN_RANGE.test(lang));
}

// B09b response shape. The verified backend (checkout-handoff.controller.ts)
// returns `unitPriceMinor` and nests `{ productId, productName }` under
// `variant`. The task contract describes a flatter shape (`priceMinor`,
// top-level `productId`/`name`). We accept both defensively and prefer the
// verified backend fields where present.
type HandoffReason = "EXPIRED" | "INVALID" | "OUT_OF_STOCK" | "PRICE_CHANGED" | "EMPTY";

type HandoffItem = {
  variantId: string;
  productId?: string;
  name?: string;
  productName?: string;
  quantity: number;
  priceMinor?: number;
  unitPriceMinor?: number;
  currency: string;
  availability: "IN_STOCK" | "OUT_OF_STOCK";
  imageUrl?: string | null;
  variant?: { id: string; sku: string; productId: string; productName: string };
};

type HandoffResponse = {
  cartId: string | null;
  status: string | null;
  items: HandoffItem[];
  expiresAt: string | null;
  canCheckout: boolean;
  reason?: HandoffReason;
};

type Phase = "loading" | "ready" | "error" | "recovery";

const REASON_COPY: Record<HandoffReason, { en: { kicker: string; title: string; body: string }; fa: { kicker: string; title: string; body: string } }> = {
  EXPIRED: {
    en: { kicker: "Checkout link", title: "This checkout link has expired.", body: "Checkout links are valid for 30 minutes. Return to the shop to start a new order." },
    fa: { kicker: "لینک پرداخت", title: "این لینک پرداخت منقضی شده است.", body: "لینک‌های پرداخت تا ۳۰ دقیقه معتبرند. برای ثبت سفارش جدید به فروشگاه بازگردید." },
  },
  INVALID: {
    en: { kicker: "Checkout link", title: "This checkout link is not valid.", body: "We couldn't verify this link. It may be malformed or tampered with. Please return to the shop." },
    fa: { kicker: "لینک پرداخت", title: "این لینک پرداخت معتبر نیست.", body: "این لینک قابل تأیید نبود. ممکن است ناقص یا دستکاری شده باشد. لطفاً به فروشگاه بازگردید." },
  },
  OUT_OF_STOCK: {
    en: { kicker: "Availability changed", title: "An item in your bag is no longer available.", body: "One or more items are out of stock. Please return to the shop and try again later." },
    fa: { kicker: "تغییر موجودی", title: "یکی از اقلام کیف شما دیگر موجود نیست.", body: "یک یا چند مورد ناموجود شده است. لطفاً به فروشگاه بازگردید و بعداً دوباره تلاش کنید." },
  },
  PRICE_CHANGED: {
    en: { kicker: "Price updated", title: "Prices have changed since this link was issued.", body: "Please review the updated prices in the shop before placing your order." },
    fa: { kicker: "تغییر قیمت", title: "قیمت‌ها از زمان صدور این لینک تغییر کرده است.", body: "لطفاً قبل از ثبت سفارش، قیمت‌های به‌روز را در فروشگاه بررسی کنید." },
  },
  EMPTY: {
    en: { kicker: "Empty bag", title: "Your bag is empty.", body: "There are no items to check out. Return to the shop to add something." },
    fa: { kicker: "کیف خالی", title: "کیف شما خالی است.", body: "موردی برای پرداخت وجود ندارد. برای افزودن مورد به فروشگاه بازگردید." },
  },
};

function toProduct(item: HandoffItem): Product {
  const productId = item.productId ?? (item.variant?.productId ?? item.variantId);
  const name = item.name ?? item.productName ?? item.variant?.productName ?? "Item";
  const priceMinor = item.priceMinor ?? item.unitPriceMinor ?? 0;
  const stockQty = item.availability === "IN_STOCK" ? Math.max(item.quantity, 1) : 0;
  const images = item.imageUrl ? [{ id: `${productId}-primary`, url: item.imageUrl, alt: name, position: 0 }] : [];
  return {
    id: productId,
    name,
    slug: item.variant?.sku ?? productId,
    description: "",
    priceMinor,
    currency: item.currency,
    imageUrl: item.imageUrl ?? null,
    stockQty,
    images,
    averageRating: null,
    commentCount: 0,
    isFavorite: false,
    category: { name: "", slug: "" },
  };
}

export function CheckoutHandoffClient({ token }: { token: string }) {
  const { addProduct } = useCart();
  const [phase, setPhase] = useState<Phase>("loading");
  const [reason, setReason] = useState<HandoffReason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    let active = true;

    (async () => {
      try {
        await restoreSession();
        const response = await api<HandoffResponse>(`/checkout/handoff/${encodeURIComponent(token)}`, {
          headers: { "x-merchant-id": MERCHANT_ID },
        });
        if (!active) return;

        if (!response.canCheckout) {
          const detected = (response.reason ?? "INVALID") as HandoffReason;
          setReason(detected);
          setPhase("recovery");
          return;
        }

        // Seed the cart once with verified current values. addProduct clamps
        // quantity to stockQty and caps at 20 (existing store behavior).
        const lines: CartLine[] = [];
        for (const item of response.items) {
          const product = toProduct(item);
          if (!product.stockQty) continue;
          addProduct(product, item.quantity);
          lines.push({ ...product, quantity: item.quantity });
        }

        if (!lines.length) {
          // canCheckout=true but no seedable items — treat as empty recovery.
          setReason("EMPTY");
          setPhase("recovery");
          return;
        }

        setPhase("ready");
      } catch (reasonValue) {
        if (!active) return;
        setError(reasonValue instanceof Error ? reasonValue.message : "We couldn't open this checkout link.");
        setPhase("error");
      }
    })();

    return () => { active = false; };
  }, [token, addProduct]);

  if (phase === "loading") {
    return <main className="checkout-page" aria-busy="true"><p>Opening your checkout…</p></main>;
  }

  if (phase === "error") {
    return (
      <main className="checkout-page checkout-empty">
        <p className="shop-kicker">Checkout link</p>
        <h1>Something went wrong.</h1>
        <p>{error ?? "We couldn't open this checkout link."}</p>
        <Link className="shop-cta" href="/shop">Return to shop</Link>
      </main>
    );
  }

  if (phase === "recovery" && reason) {
    const fa = detectPersian();
    const copy = REASON_COPY[reason];
    const content = fa ? copy.fa : copy.en;
    return (
      <main className="checkout-page checkout-empty" dir={fa ? "rtl" : undefined}>
        <p className="shop-kicker">{content.kicker}</p>
        <h1>{content.title}</h1>
        <p>{content.body}</p>
        <Link className="shop-cta" href="/shop">{fa ? "بازگشت به فروشگاه" : "Return to shop"}</Link>
      </main>
    );
  }

  return <CheckoutClient />;
}

export { CheckoutHandoffClient as HandoffClient };