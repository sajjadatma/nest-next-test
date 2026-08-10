"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { useCart } from "@/components/cart-provider";
import { money, type ShippingOption } from "@/components/shop-types";
import { api, restoreSession, token } from "@/lib/api";

type CheckoutDetails = { email: string; phone: string; fullName: string; line1: string; city: string; postalCode: string; country: string };
type OrderQuote = { subtotalMinor: number; discountMinor: number; shippingMinor: number; totalMinor: number; promotionCode: string | null; shipping: { id: string; label: string; description?: string | null; eta: string } };
type SavedAddress = { id: string; recipientName: string; phone?: string | null; line1: string; city: string; postalCode: string; countryCode: string; isDefaultShipping: boolean };
const EMPTY_DETAILS: CheckoutDetails = { email: "", phone: "", fullName: "", line1: "", city: "", postalCode: "", country: "" };

export function CheckoutClient() {
  const router = useRouter();
  const { cart, ready, subtotalMinor, clearCart } = useCart();
  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<CheckoutDetails>({ defaultValues: EMPTY_DETAILS });
  const details = useWatch({ control });
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [sourceAddressId, setSourceAddressId] = useState("");
  const [shippingMethod, setShippingMethod] = useState("");
  const [promotionCode, setPromotionCode] = useState("");
  const [appliedPromotionCode, setAppliedPromotionCode] = useState("");
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [promotionMessage, setPromotionMessage] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState("");
  const [checkoutKeys, setCheckoutKeys] = useState<{ idempotencyKey: string; confirmationToken: string } | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const draft = sessionStorage.getItem("nest-shop-checkout-draft");
        if (draft) reset({ ...EMPTY_DETAILS, ...(JSON.parse(draft) as CheckoutDetails) });
      } catch { /* Ignore an invalid local draft. */ }
    });
    return () => { active = false; };
  }, [reset]);

  useEffect(() => {
    void (async () => {
      if (!token() && !await restoreSession()) return;
      const addresses = await api<SavedAddress[]>("/account/addresses").catch(() => []);
      setSavedAddresses(addresses);
      const preferred = addresses.find((address) => address.isDefaultShipping) ?? addresses[0];
      if (preferred) { setSourceAddressId(preferred.id); reset({ email: "", phone: preferred.phone ?? "", fullName: preferred.recipientName, line1: preferred.line1, city: preferred.city, postalCode: preferred.postalCode, country: preferred.countryCode }); }
    })();
  }, [reset]);

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

  async function placeOrder(values: CheckoutDetails) {
    if (!shippingMethod || !cart.length) return;
    setError("");
    try {
      await restoreSession();
      const keys = checkoutKeys ?? { idempotencyKey: crypto.randomUUID(), confirmationToken: crypto.randomUUID() };
      if (!checkoutKeys) setCheckoutKeys(keys);
      const order = await api<{ confirmationToken: string }>("/shop/orders", {
        method: "POST",
        body: JSON.stringify({
          ...keys,
          email: values.email,
          phone: values.phone,
          items: cart.map(({ id, quantity }) => ({ productId: id, quantity })),
          shippingMethod,
          promotionCode: appliedPromotionCode || undefined,
          sourceAddressId: sourceAddressId || undefined,
          shippingAddress: { fullName: values.fullName, line1: values.line1, city: values.city, postalCode: values.postalCode, country: values.country },
        }),
      });
      clearCart();
      sessionStorage.removeItem("nest-shop-checkout-draft");
      setCheckoutKeys(null);
      router.push(`/shop/order/${order.confirmationToken}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t place your order.");
    }
  }

  if (!ready) return <main className="checkout-page" aria-busy="true"><p>Preparing checkout…</p></main>;
  if (!cart.length) return <main className="checkout-page checkout-empty"><p className="shop-kicker">Delivery</p><h1>Your bag is empty.</h1><p>Add something before continuing to checkout.</p><Link className="shop-cta" href="/shop">Return to shop</Link></main>;
  return (
    <main className="checkout-page">
      <nav className="checkout-progress" aria-label="Checkout progress"><Link href="/shop/bag">1. Bag</Link><strong aria-current="step">2. Delivery</strong><span>3. Confirmation</span></nav>
      <header><p className="shop-kicker">Order information</p><h1>Where should it go?</h1><p>We’ll use these details only to deliver and confirm your order.</p></header>
      <form className="checkout-layout" onSubmit={handleSubmit(placeOrder)}>
        <div className="checkout-fields">
          <fieldset><legend>Contact</legend><div className="checkout-two"><label>Email address<input type="email" autoComplete="email" {...register("email", { required: "Email is required" })} /></label><label>Phone number<input type="tel" autoComplete="tel" pattern="[+0-9 ()-]{7,20}" {...register("phone", { required: "Phone number is required" })} /></label></div></fieldset>
          {savedAddresses.length > 0 && <fieldset><legend>Saved address</legend><label>Use a saved address<select value={sourceAddressId} onChange={(event) => { const id = event.target.value; setSourceAddressId(id); const address = savedAddresses.find((item) => item.id === id); if (address) reset({ ...details, phone: address.phone ?? "", fullName: address.recipientName, line1: address.line1, city: address.city, postalCode: address.postalCode, country: address.countryCode }); }}><option value="">Enter a new address</option>{savedAddresses.map((address) => <option key={address.id} value={address.id}>{address.recipientName} · {address.line1}, {address.city}</option>)}</select></label></fieldset>}
          <fieldset><legend>Delivery address</legend><label>Full name<input autoComplete="name" {...register("fullName", { required: "Full name is required" })} /></label><label>Street address<input autoComplete="street-address" {...register("line1", { required: "Street address is required" })} /></label><div className="checkout-two"><label>City<input autoComplete="address-level2" {...register("city", { required: "City is required" })} /></label><label>Postal code<input autoComplete="postal-code" {...register("postalCode", { required: "Postal code is required" })} /></label></div><label>Country<input autoComplete="country-name" {...register("country", { required: "Country is required" })} /></label></fieldset>
          <fieldset><legend>Delivery method</legend>{loadingOptions ? <p>Finding delivery options…</p> : options.length ? <div className="shipping-options">{options.map((option) => <label className={shippingMethod === option.id ? "selected" : ""} key={option.id}><input type="radio" name="shippingMethod" value={option.id} checked={shippingMethod === option.id} onChange={() => setShippingMethod(option.id)} /><span><strong>{option.label}</strong><small>{option.description} · {option.eta}</small></span><b>{option.priceMinor ? money(option.priceMinor) : "Included"}</b></label>)}</div> : <p className="form-error">No delivery methods are currently available.</p>}</fieldset>
          <fieldset><legend>Promotion</legend><label>Promotion code<input value={promotionCode} onChange={(event) => { setPromotionCode(event.target.value.toUpperCase()); setPromotionMessage(""); }} placeholder="WELCOME10" autoComplete="off" /><small>Apply a code to see the exact COD total before placing your order.</small></label><div className="promotion-actions"><button className="shop-secondary" type="button" onClick={() => setAppliedPromotionCode(promotionCode.trim())} disabled={quoteLoading || !promotionCode.trim()}>Apply code</button>{appliedPromotionCode && <button className="text-button" type="button" onClick={() => { setAppliedPromotionCode(""); setPromotionCode(""); setPromotionMessage(""); }}>Remove</button>}</div>{promotionMessage && <p className={quote?.promotionCode ? "form-success" : "form-error"} role="status">{promotionMessage}</p>}</fieldset>
          <div className="payment-note"><strong>Payment on delivery</strong><p>No payment is taken online. Have your chosen payment method ready when the order arrives.</p></div>
        </div>
        <aside className="checkout-summary"><p className="shop-kicker">Your order</p><h2>{cart.reduce((sum, line) => sum + line.quantity, 0)} items</h2><div className="checkout-summary-lines">{cart.map((line) => <div key={line.id}><span>{line.quantity} × {line.name}</span><strong>{money(line.priceMinor * line.quantity, line.currency)}</strong></div>)}</div><dl><div><dt>Subtotal</dt><dd>{money(quote?.subtotalMinor ?? subtotalMinor)}</dd></div>{quote?.discountMinor ? <div><dt>Promotion</dt><dd className="discount-value">−{money(quote.discountMinor)}</dd></div> : null}<div><dt>Delivery</dt><dd>{quote ? (quote.shippingMinor ? money(quote.shippingMinor) : "Included") : selectedShipping ? (selectedShipping.priceMinor ? money(selectedShipping.priceMinor) : "Included") : "—"}</dd></div></dl><div className="checkout-total"><span>Cash due on delivery</span><strong>{quoteLoading ? "Checking…" : money(totalMinor)}</strong></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="shop-primary" disabled={isSubmitting || quoteLoading || !shippingMethod || Boolean(appliedPromotionCode && !quote?.promotionCode)}>{isSubmitting ? "Placing order…" : `Place COD order · ${money(totalMinor)}`}</button><Link href="/shop/bag">← Back to bag</Link></aside>
      </form>
    </main>
  );
}
