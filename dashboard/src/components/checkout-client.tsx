"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart-provider";
import { money, type ShippingOption } from "@/components/shop-types";
import { api, restoreSession } from "@/lib/api";

type CheckoutDetails = { email: string; phone: string; fullName: string; line1: string; city: string; postalCode: string; country: string };
type OrderQuote = { subtotalMinor: number; discountMinor: number; shippingMinor: number; totalMinor: number; promotionCode: string | null; shipping: { id: string; label: string; description?: string | null; eta: string } };
const EMPTY_DETAILS: CheckoutDetails = { email: "", phone: "", fullName: "", line1: "", city: "", postalCode: "", country: "" };

export function CheckoutClient() {
  const router = useRouter();
  const { cart, ready, subtotalMinor, clearCart } = useCart();
  const [details, setDetails] = useState<CheckoutDetails>(EMPTY_DETAILS);
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [shippingMethod, setShippingMethod] = useState("");
  const [promotionCode, setPromotionCode] = useState("");
  const [appliedPromotionCode, setAppliedPromotionCode] = useState("");
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [promotionMessage, setPromotionMessage] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const checkoutKeys = useRef<{ idempotencyKey: string; confirmationToken: string } | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const draft = sessionStorage.getItem("nest-shop-checkout-draft");
        if (draft) setDetails({ ...EMPTY_DETAILS, ...(JSON.parse(draft) as CheckoutDetails) });
      } catch { /* Ignore an invalid local draft. */ }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    sessionStorage.setItem("nest-shop-checkout-draft", JSON.stringify(details));
  }, [details]);

  useEffect(() => {
    let active = true;
    api<ShippingOption[]>("/shop/shipping-options")
      .then((items) => { if (active) { setOptions(items); setShippingMethod((current) => current || items[0]?.id || ""); } })
      .catch((reason: Error) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, []);

  const selectedShipping = options.find((option) => option.id === shippingMethod);
  const totalMinor = quote?.totalMinor ?? subtotalMinor + (selectedShipping?.priceMinor ?? 0);

  useEffect(() => {
    if (!ready || !cart.length || !shippingMethod) return;
    let active = true;
    queueMicrotask(() => { if (active) setQuoteLoading(true); });
    api<OrderQuote>("/shop/order-quote", {
      method: "POST",
      body: JSON.stringify({ items: cart.map(({ id, quantity }) => ({ productId: id, quantity })), shippingMethod, promotionCode: appliedPromotionCode || undefined }),
    }).then((nextQuote) => {
      if (active) { setQuote(nextQuote); setPromotionMessage(nextQuote.promotionCode ? `Applied ${nextQuote.promotionCode}.` : appliedPromotionCode ? "Promotion applied." : ""); }
    }).catch((reason) => {
      if (active) { setQuote(null); setPromotionMessage(reason instanceof Error ? reason.message : "We could not validate this promotion."); }
    }).finally(() => { if (active) setQuoteLoading(false); });
    return () => { active = false; };
  }, [appliedPromotionCode, cart, ready, shippingMethod]);

  function update(field: keyof CheckoutDetails, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shippingMethod || !cart.length) return;
    setSubmitting(true);
    setError("");
    try {
      await restoreSession();
      checkoutKeys.current ??= { idempotencyKey: crypto.randomUUID(), confirmationToken: crypto.randomUUID() };
      const order = await api<{ confirmationToken: string }>("/shop/orders", {
        method: "POST",
        body: JSON.stringify({
          ...checkoutKeys.current,
          email: details.email,
          phone: details.phone,
          items: cart.map(({ id, quantity }) => ({ productId: id, quantity })),
          shippingMethod,
          promotionCode: appliedPromotionCode || undefined,
          shippingAddress: { fullName: details.fullName, line1: details.line1, city: details.city, postalCode: details.postalCode, country: details.country },
        }),
      });
      clearCart();
      sessionStorage.removeItem("nest-shop-checkout-draft");
      checkoutKeys.current = null;
      router.push(`/shop/order/${order.confirmationToken}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t place your order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return <main className="checkout-page" aria-busy="true"><p>Preparing checkout…</p></main>;
  if (!cart.length) return <main className="checkout-page checkout-empty"><p className="shop-kicker">Delivery</p><h1>Your bag is empty.</h1><p>Add something before continuing to checkout.</p><Link className="shop-cta" href="/shop">Return to shop</Link></main>;
  return (
    <main className="checkout-page">
      <nav className="checkout-progress" aria-label="Checkout progress"><Link href="/shop/bag">1. Bag</Link><strong aria-current="step">2. Delivery</strong><span>3. Confirmation</span></nav>
      <header><p className="shop-kicker">Order information</p><h1>Where should it go?</h1><p>We’ll use these details only to deliver and confirm your order.</p></header>
      <form className="checkout-layout" onSubmit={placeOrder}>
        <div className="checkout-fields">
          <fieldset><legend>Contact</legend><div className="checkout-two"><label>Email address<input type="email" autoComplete="email" required value={details.email} onChange={(event) => update("email", event.target.value)} /></label><label>Phone number<input type="tel" autoComplete="tel" required pattern="[+0-9 ()-]{7,20}" value={details.phone} onChange={(event) => update("phone", event.target.value)} /></label></div></fieldset>
          <fieldset><legend>Delivery address</legend><label>Full name<input autoComplete="name" required value={details.fullName} onChange={(event) => update("fullName", event.target.value)} /></label><label>Street address<input autoComplete="street-address" required value={details.line1} onChange={(event) => update("line1", event.target.value)} /></label><div className="checkout-two"><label>City<input autoComplete="address-level2" required value={details.city} onChange={(event) => update("city", event.target.value)} /></label><label>Postal code<input autoComplete="postal-code" required value={details.postalCode} onChange={(event) => update("postalCode", event.target.value)} /></label></div><label>Country<input autoComplete="country-name" required value={details.country} onChange={(event) => update("country", event.target.value)} /></label></fieldset>
          <fieldset><legend>Delivery method</legend>{loadingOptions ? <p>Finding delivery options…</p> : options.length ? <div className="shipping-options">{options.map((option) => <label className={shippingMethod === option.id ? "selected" : ""} key={option.id}><input type="radio" name="shippingMethod" value={option.id} checked={shippingMethod === option.id} onChange={() => setShippingMethod(option.id)} /><span><strong>{option.label}</strong><small>{option.description} · {option.eta}</small></span><b>{option.priceMinor ? money(option.priceMinor) : "Included"}</b></label>)}</div> : <p className="form-error">No delivery methods are currently available.</p>}</fieldset>
          <fieldset><legend>Promotion</legend><label>Promotion code<input value={promotionCode} onChange={(event) => { setPromotionCode(event.target.value.toUpperCase()); setPromotionMessage(""); }} placeholder="WELCOME10" autoComplete="off" /><small>Apply a code to see the exact COD total before placing your order.</small></label><div className="promotion-actions"><button className="shop-secondary" type="button" onClick={() => setAppliedPromotionCode(promotionCode.trim())} disabled={quoteLoading || !promotionCode.trim()}>Apply code</button>{appliedPromotionCode && <button className="text-button" type="button" onClick={() => { setAppliedPromotionCode(""); setPromotionCode(""); setPromotionMessage(""); }}>Remove</button>}</div>{promotionMessage && <p className={quote?.promotionCode ? "form-success" : "form-error"} role="status">{promotionMessage}</p>}</fieldset>
          <div className="payment-note"><strong>Payment on delivery</strong><p>No payment is taken online. Have your chosen payment method ready when the order arrives.</p></div>
        </div>
        <aside className="checkout-summary"><p className="shop-kicker">Your order</p><h2>{cart.reduce((sum, line) => sum + line.quantity, 0)} items</h2><div className="checkout-summary-lines">{cart.map((line) => <div key={line.id}><span>{line.quantity} × {line.name}</span><strong>{money(line.priceMinor * line.quantity, line.currency)}</strong></div>)}</div><dl><div><dt>Subtotal</dt><dd>{money(quote?.subtotalMinor ?? subtotalMinor)}</dd></div>{quote?.discountMinor ? <div><dt>Promotion</dt><dd className="discount-value">−{money(quote.discountMinor)}</dd></div> : null}<div><dt>Delivery</dt><dd>{quote ? (quote.shippingMinor ? money(quote.shippingMinor) : "Included") : selectedShipping ? (selectedShipping.priceMinor ? money(selectedShipping.priceMinor) : "Included") : "—"}</dd></div></dl><div className="checkout-total"><span>Cash due on delivery</span><strong>{quoteLoading ? "Checking…" : money(totalMinor)}</strong></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="shop-primary" disabled={submitting || quoteLoading || !shippingMethod || Boolean(appliedPromotionCode && !quote?.promotionCode)}>{submitting ? "Placing order…" : `Place COD order · ${money(totalMinor)}`}</button><Link href="/shop/bag">← Back to bag</Link></aside>
      </form>
    </main>
  );
}
