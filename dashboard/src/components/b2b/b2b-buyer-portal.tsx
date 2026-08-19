"use client";
/* These effects intentionally synchronize the authenticated catalogue with the active company. */
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, clear, restoreSession, token } from "@/lib/api";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslation } from "@/i18n/language-provider";
import { B2bState, formatB2bMoney } from "@/components/b2b/b2b-shell";
import type { CatalogItem, CatalogResponse, Company } from "@/components/b2b/types";

type PortalStatus = "loading" | "ready" | "unauthorized" | "error";

export function B2bBuyerPortal() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PortalStatus>("loading");
  const [companies, setCompanies] = useState<Company[]>([]); const [companyId, setCompanyId] = useState(""); const [catalog, setCatalog] = useState<CatalogResponse | null>(null); const [query, setQuery] = useState(""); const [error, setError] = useState(""); const [quantities, setQuantities] = useState<Record<string, number>>({}); const [priceLoading, setPriceLoading] = useState<string | null>(null);
  const company = useMemo(() => companies.find((item) => item.id === companyId) ?? companies[0], [companies, companyId]);

  useEffect(() => { let mounted = true; void (async () => { try { if (!token() && !await restoreSession()) { if (mounted) setStatus("unauthorized"); return; } const result = await api<Company[]>("/b2b/companies"); if (!mounted) return; setCompanies(result); if (result[0]) setCompanyId(result[0].id); setStatus("ready"); } catch (reason) { if (mounted) { setStatus("error"); setError(reason instanceof Error ? reason.message : t("Could not load your companies.")); } } })(); return () => { mounted = false; }; }, []);
  useEffect(() => { if (!company?.id) return; let mounted = true; setCatalog(null); setError(""); void api<CatalogResponse>(`/b2b/companies/${company.id}/catalog?${new URLSearchParams({ ...(query ? { q: query } : {}), pageSize: "48" })}`).then((data) => { if (mounted) { setCatalog(data); setQuantities(Object.fromEntries(data.items.map((item) => [item.variantId, item.minimumOrderQty]))); } }).catch((reason) => { if (mounted) setError(reason instanceof Error ? reason.message : t("Could not load the company catalogue.")); }); return () => { mounted = false; }; }, [company?.id, query]);
  async function refreshPrice(item: CatalogItem) { const quantity = quantities[item.variantId] ?? item.minimumOrderQty; setPriceLoading(item.variantId); try { const result = await api<{ unitPriceMinor: number; subtotalMinor: number; source: CatalogItem["source"] }>(`/b2b/companies/${company.id}/catalog/${item.variantId}/price?${new URLSearchParams({ quantity: String(quantity), currency: item.currency })}`); setCatalog((current) => current ? { ...current, items: current.items.map((entry) => entry.variantId === item.variantId ? { ...entry, ...result, quantity } : entry) } : current); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : t("Quantity is outside the allowed order rules.")); } finally { setPriceLoading(null); } }
  function signOut() { void api("/auth/logout", { method: "POST" }).catch(() => undefined); clear(); window.location.assign("/login?redirect=%2Fbusiness"); }
  if (status === "loading") return <main className="b2b-portal-loading"><span className="eyebrow">{t("Loading business portal…")}</span></main>;
  if (status === "unauthorized") return <main className="b2b-portal-page"><B2bPortalChrome onSignOut={signOut} /><B2bState title={t("Sign in to view business pricing")} detail={t("Company catalogues and negotiated prices are available to authenticated buyers.")} action={<Link className="shop-primary" href="/login?redirect=%2Fbusiness">{t("Sign in")}</Link>} /></main>;
  if (status === "error") return <main className="b2b-portal-page"><B2bPortalChrome onSignOut={signOut} /><B2bState title={t("Business portal unavailable")} detail={error} action={<Link className="shop-secondary" href="/shop">{t("Return to shop")}</Link>} /></main>;
  if (!companies.length) return <main className="b2b-portal-page"><B2bPortalChrome onSignOut={signOut} /><B2bState title={t("No active company access")} detail={t("Ask a company administrator to add you as an active buyer or viewer.")} action={<Link className="shop-secondary" href="/shop">{t("Return to shop")}</Link>} /></main>;
  return <main className="b2b-portal-page"><B2bPortalChrome onSignOut={signOut} /><section className="b2b-portal-hero"><div><p className="eyebrow">{t("Business buying")}</p><h1>{t("Your company catalogue")}</h1><p>{t("Review company pricing, quantity rules and available stock before your team places an order.")}</p></div><div className="b2b-portal-access"><label>{t("Active company")}<select value={company.id} onChange={(event) => setCompanyId(event.target.value)}>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span><strong>{company.membership?.role ?? "BUYER"}</strong><small>{t("Membership role")}</small></span></div></section><section className="b2b-portal-controls"><form onSubmit={(event) => { event.preventDefault(); setQuery((current) => current.trim()); }}><label>{t("Search catalogue")}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search by product or SKU")} /></label><button className="shop-primary" type="submit">{t("Search")}</button></form><p>{catalog ? `${catalog.total} ${t("catalogue items")}` : t("Loading catalogue…")}</p></section>{error && <p className="form-error" role="alert">{error}</p>}{catalog?.items.length ? <section className="b2b-portal-grid">{catalog.items.map((item) => <article className="b2b-product-card" key={item.variantId}><div className="b2b-product-card-head"><span className="b2b-product-kicker">{item.product.category?.name ?? t("Catalogue")}</span><span className="b2b-sku">{item.sku}</span></div><h2>{item.product.name}</h2><p className="b2b-variant-name">{item.name}</p><div className="b2b-product-price"><strong>{formatB2bMoney(item.unitPriceMinor, item.currency)}</strong><span>{item.source === "tier" ? t("Volume tier applied") : item.source === "price_list" ? t("Company price") : t("Base price")}</span></div><dl className="b2b-product-facts"><div><dt>{t("Minimum")}</dt><dd>{item.minimumOrderQty}</dd></div><div><dt>{t("Increment")}</dt><dd>{item.quantityIncrement}</dd></div><div><dt>{t("Available")}</dt><dd>{item.stockQty}</dd></div></dl><div className="b2b-quantity"><label>{t("Order quantity")}<input min={item.minimumOrderQty} step={item.quantityIncrement} type="number" value={quantities[item.variantId] ?? item.minimumOrderQty} onChange={(event) => setQuantities((current) => ({ ...current, [item.variantId]: Number(event.target.value) }))} /></label><button className="shop-secondary" type="button" disabled={priceLoading === item.variantId} onClick={() => void refreshPrice(item)}>{priceLoading === item.variantId ? t("Checking…") : t("Check price")}</button></div><p className="b2b-subtotal">{t("Estimated subtotal")} <strong>{formatB2bMoney(item.subtotalMinor, item.currency)}</strong></p></article>)}</section> : catalog && <B2bState title={t("No catalogue items found")} detail={t("Try a different search or ask your account manager about available products.")} />}</main>;
}

function B2bPortalChrome({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useTranslation();
  return <><header className="b2b-portal-nav"><Link className="shop-logo" href="/shop">NEST<span>™</span></Link><nav aria-label={t("Business portal navigation")}><Link href="/shop">{t("Storefront")}</Link><Link href="/shop/account">{t("Account")}</Link></nav><div><LanguageSwitcher compact /><button type="button" onClick={onSignOut}>{t("Sign out")}</button></div></header><style jsx global>{`
    .b2b-portal-page { min-height: 100vh; background: var(--nest-paper); color: var(--nest-ink); padding-bottom: 5rem; }
    .b2b-portal-loading { min-height: 100vh; display: grid; place-items: center; background: var(--nest-paper); color: var(--nest-muted); }
    .b2b-portal-nav { min-height: 5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem clamp(1.25rem, 5vw, 5rem); border-bottom: 1px solid var(--nest-line); background: rgba(247,245,239,.95); }
    .b2b-portal-nav .shop-logo { color: inherit; font-weight: 700; letter-spacing: .08em; text-decoration: none; }
    .b2b-portal-nav .shop-logo span { margin-left: .15rem; font-size: .55em; vertical-align: top; }
    .b2b-portal-nav nav { display: flex; gap: 1.25rem; margin-inline: auto; }
    .b2b-portal-nav nav a { color: inherit; font-size: .75rem; font-weight: 700; text-decoration: none; }
    .b2b-portal-nav > div { display: flex; align-items: center; gap: 1rem; }
    .b2b-portal-nav button { border: 0; border-bottom: 1px solid currentColor; background: transparent; padding: .3rem 0; color: inherit; font: 700 .7rem Arial; cursor: pointer; }
    .b2b-portal-page > .b2b-state { max-width: 40rem; margin: clamp(4rem, 10vw, 9rem) auto; }
    .b2b-portal-hero { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(19rem, .7fr); gap: 2rem; align-items: end; max-width: 90rem; margin: 0 auto; padding: clamp(4rem, 8vw, 7rem) clamp(1.25rem, 5vw, 5rem) 3rem; background: var(--nest-sage); }
    .b2b-portal-hero h1 { max-width: 12ch; margin: .55rem 0 .9rem; font-family: Georgia, serif; font-size: clamp(3rem, 7vw, 6rem); font-weight: 400; letter-spacing: -.09em; line-height: .88; }
    .b2b-portal-hero p:last-child { max-width: 37rem; margin: 0; color: var(--nest-muted); line-height: 1.6; }
    .b2b-portal-access { display: grid; gap: 1rem; padding: 1.25rem; background: var(--nest-ink); color: var(--nest-paper); }
    .b2b-portal-access label { display: grid; gap: .4rem; color: rgba(247,245,239,.7); font-size: .7rem; font-weight: 700; }
    .b2b-portal-access select { min-height: 3rem; border: 1px solid rgba(247,245,239,.35); background: transparent; padding: .6rem; color: inherit; font: inherit; }
    .b2b-portal-access span { display: grid; gap: .2rem; padding-top: .8rem; border-top: 1px solid rgba(247,245,239,.22); }
    .b2b-portal-access strong { color: var(--nest-sage); font-size: 1.2rem; }
    .b2b-portal-access small { color: rgba(247,245,239,.62); }
    .b2b-portal-controls { display: flex; align-items: end; justify-content: space-between; gap: 1rem; max-width: 90rem; margin: auto; padding: 2rem clamp(1.25rem, 5vw, 5rem) 1rem; }
    .b2b-portal-controls form { display: flex; align-items: end; gap: .6rem; width: min(100%, 36rem); }
    .b2b-portal-controls label { display: grid; flex: 1; gap: .35rem; color: var(--nest-muted); font-size: .7rem; font-weight: 700; }
    .b2b-portal-controls input { min-height: 3rem; border: 1px solid var(--nest-line); background: #fff; padding: .7rem; color: inherit; font: inherit; }
    .b2b-portal-controls > p { margin: 0; color: var(--nest-muted); font-size: .75rem; }
    .b2b-portal-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; max-width: 90rem; margin: auto; padding: 1rem clamp(1.25rem, 5vw, 5rem); }
    .b2b-product-card { display: grid; gap: .85rem; padding: 1.25rem; border: 1px solid var(--nest-line); background: #fff; }
    .b2b-product-card-head { display: flex; justify-content: space-between; gap: .5rem; color: var(--nest-muted); font-size: .64rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .b2b-product-card h2 { margin: .25rem 0 0; font-family: Georgia, serif; font-size: 1.65rem; font-weight: 400; letter-spacing: -.04em; }
    .b2b-variant-name { min-height: 1.2rem; margin: -.45rem 0 0; color: var(--nest-muted); font-size: .8rem; }
    .b2b-product-price { display: flex; align-items: baseline; justify-content: space-between; gap: .8rem; padding: .75rem 0; border-block: 1px solid var(--nest-line); }
    .b2b-product-price strong { font-family: Georgia, serif; font-size: 1.5rem; font-weight: 400; }
    .b2b-product-price span { color: var(--nest-success); font-size: .68rem; font-weight: 700; text-align: end; }
    .b2b-product-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; margin: 0; }
    .b2b-product-facts div { display: grid; gap: .2rem; }
    .b2b-product-facts dt { color: var(--nest-muted); font-size: .62rem; font-weight: 700; text-transform: uppercase; }
    .b2b-product-facts dd { margin: 0; font-size: .9rem; font-weight: 700; }
    .b2b-quantity { display: flex; align-items: end; gap: .5rem; }
    .b2b-quantity label { display: grid; flex: 1; gap: .35rem; color: var(--nest-muted); font-size: .68rem; font-weight: 700; }
    .b2b-quantity input { min-height: 2.8rem; width: 100%; border: 1px solid var(--nest-line); padding: .6rem; font: inherit; }
    .b2b-quantity .shop-secondary { min-height: 2.8rem; }
    .b2b-subtotal { display: flex; justify-content: space-between; gap: .5rem; margin: 0; color: var(--nest-muted); font-size: .75rem; }
    .b2b-subtotal strong { color: var(--nest-ink); }
    @media (max-width: 900px) { .b2b-portal-hero { grid-template-columns: 1fr; } .b2b-portal-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 620px) { .b2b-portal-nav { flex-wrap: wrap; } .b2b-portal-nav nav { order: 3; width: 100%; margin: 0; } .b2b-portal-controls { align-items: stretch; flex-direction: column; } .b2b-portal-controls form { width: 100%; } .b2b-portal-grid { grid-template-columns: 1fr; } }
  `}</style></>;
}
