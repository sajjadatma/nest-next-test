"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money, Product, ShopSection } from "@/components/shop-admin-types";

type ShippingMethod = { id: string; code: string; label: string; description?: string | null; priceMinor: number; eta: string; isActive: boolean };
type Promotion = { id: string; code: string; type: "PERCENTAGE" | "FIXED"; value: number; startsAt: string | null; endsAt: string | null; minimumSubtotalMinor?: number | null; usageLimit?: number | null; usedCount?: number; isActive: boolean };
type ModerationItem = { id: string; body: string; rating?: number | null; status: "PENDING" | "PUBLISHED" | "HIDDEN"; createdAt: string; product?: { name: string }; author?: { name?: string | null; email?: string } };
type Report = { metrics?: { grossSalesMinor?: number; discountsMinor?: number; shippingMinor?: number; refundsMinor?: number; netSalesMinor?: number; orders?: number }; topProducts?: { name: string; units: number; revenueMinor: number }[] };
type AuditItem = { id: string; action: string; targetType: string; targetId?: string | null; createdAt: string; actor?: { name?: string | null; email?: string } | null; metadata?: Record<string, unknown> | null };

function EndpointNotice({ error }: { error: string }) {
  return error ? <p className="manager-note management-pending">{error}</p> : null;
}

export function ShopManagementPanels({ section, products }: { section: ShopSection; products: Product[] }) {
  if (section === "inventory") return <InventoryPanel products={products} />;
  if (section === "shipping") return <ShippingPanel />;
  if (section === "promotions") return <PromotionsPanel />;
  if (section === "moderation") return <ModerationPanel />;
  if (section === "reports") return <ReportsPanel />;
  if (section === "audit") return <AuditPanel />;
  return null;
}

function InventoryPanel({ products }: { products: Product[] }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("0");
  const [reason, setReason] = useState("Stocktake correction");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const lowStock = products.filter((product) => product.stockQty <= product.lowStockThreshold);

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setError("");
    try {
      await api(`/shop/admin/inventory/${productId}/adjustments`, { method: "POST", body: JSON.stringify({ quantityDelta: Number(quantity), reason: reason === "Return restocked" ? "RETURN" : "ADJUSTMENT", note: reason }) });
      setMessage("Stock adjustment recorded in the inventory ledger."); setQuantity("0");
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "Could not record the adjustment."); }
  }
  return <>
    <section className="content-card management-hero"><div><p className="eyebrow">Inventory control</p><h2>Protect available stock</h2><p>Every adjustment is recorded with a reason. Orders reserve units until they are cancelled or fulfilled.</p></div><span className="status-dot">{lowStock.length} need attention</span></section>
    <div className="management-split">
      <section className="content-card"><div className="section-heading"><div><p className="eyebrow">Adjustment</p><h2>Record stock movement</h2></div></div>
        <form className="shop-form management-form" onSubmit={adjust}><label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)} required>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.stockQty} available</option>)}</select></label><label>Change in units<input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" required aria-describedby="movement-help" /></label><small id="movement-help">Use a positive value for received/restocked units and a negative value for loss or correction.</small><label>Reason<select value={reason} onChange={(event) => setReason(event.target.value)}><option>Stocktake correction</option><option>Received stock</option><option>Damaged or lost</option><option>Return restocked</option></select></label><button className="admin-action">Record adjustment</button></form>
        {message && <p className="notice success">{message}</p>}{error && <p className="notice error">{error}</p>}</section>
      <section className="content-card"><div className="section-heading"><div><p className="eyebrow">Watchlist</p><h2>Low &amp; out of stock</h2></div></div><div className="management-list">{lowStock.length ? lowStock.map((product) => <div key={product.id}><span><strong>{product.name}</strong><small>Current sellable stock</small></span><b className={product.stockQty === 0 ? "stock-zero" : "stock-low"}>{product.stockQty === 0 ? "Out" : `${product.stockQty} left`}</b></div>) : <p className="manager-note">All active products are above the low-stock threshold.</p>}</div></section>
    </div>
      <section className="content-card"><div className="section-heading"><div><p className="eyebrow">Current availability</p><h2>Inventory by product</h2></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Product</th><th>SKU</th><th>Available</th><th>Reorder point</th><th>Last movement</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong></td><td>—</td><td>{product.stockQty}</td><td>{product.lowStockThreshold} units</td><td>Inventory ledger rolling out</td></tr>)}</tbody></table></div></section>
  </>;
}

function ShippingPanel() {
  const [items, setItems] = useState<ShippingMethod[]>([]); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ name: "", zones: "", priceMinor: "0", eta: "3–5 business days", freeOverMinor: "" });
  useEffect(() => { api<ShippingMethod[]>("/shop/admin/shipping-methods").then(setItems).catch(() => setError("Shipping rules will appear here once the management endpoint is available.")); }, []);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setMessage(""); try { await api("/shop/admin/shipping-methods", { method: "POST", body: JSON.stringify({ code: draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), label: draft.name, description: draft.zones ? `Zones: ${draft.zones}` : undefined, priceMinor: Number(draft.priceMinor), eta: draft.eta, isActive: true }) }); setMessage("Delivery method saved."); setDraft({ name: "", zones: "", priceMinor: "0", eta: "3–5 business days", freeOverMinor: "" }); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not save delivery method."); } }
  return <div className="management-split"><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Delivery rules</p><h2>Shipping methods</h2></div></div><EndpointNotice error={error} /><div className="management-list">{items.length ? items.map((item) => <div key={item.id}><span><strong>{item.label}</strong><small>{item.description || "All destinations"} · {item.eta}</small></span><b>{item.isActive ? money(item.priceMinor) : "Disabled"}</b></div>) : !error && <p className="manager-note">No shipping methods have been configured.</p>}</div></section><section className="content-card"><div className="section-heading"><div><p className="eyebrow">New method</p><h2>Create delivery rule</h2></div></div><form className="shop-form management-form" onSubmit={save}><label>Internal name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Express delivery" /></label><label>Zones (country codes, comma separated)<input value={draft.zones} onChange={(event) => setDraft({ ...draft, zones: event.target.value })} placeholder="IR, AE" /></label><label>Delivery price (cents)<input required min="0" type="number" value={draft.priceMinor} onChange={(event) => setDraft({ ...draft, priceMinor: event.target.value })} /></label><label>Customer delivery estimate<input required value={draft.eta} onChange={(event) => setDraft({ ...draft, eta: event.target.value })} /></label><button className="admin-action">Save delivery rule</button></form>{message && <p className="manager-note">{message}</p>}</section></div>;
}

function PromotionsPanel() {
  const [items, setItems] = useState<Promotion[]>([]); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [draft, setDraft] = useState({ code: "", type: "PERCENTAGE", value: "10", minimumMinor: "", usageLimit: "", endsAt: "" });
  useEffect(() => { api<Promotion[]>("/shop/admin/promotions").then(setItems).catch(() => setError("Promotion controls will activate when the promotions endpoint is deployed.")); }, []);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { await api("/shop/admin/promotions", { method: "POST", body: JSON.stringify({ ...draft, code: draft.code.trim().toUpperCase(), value: Number(draft.value), minimumSubtotalMinor: draft.minimumMinor ? Number(draft.minimumMinor) : undefined, usageLimit: draft.usageLimit ? Number(draft.usageLimit) : undefined, endsAt: draft.endsAt || undefined, isActive: true }) }); setMessage("Promotion saved."); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not save promotion."); } }
  return <div className="management-split"><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Discounts</p><h2>Active promotions</h2></div></div><EndpointNotice error={error} /><div className="management-list">{items.length ? items.map((item) => <div key={item.id}><span><strong>{item.code}</strong><small>{item.type === "PERCENTAGE" ? `${item.value}% off` : money(item.value)} · {item.usedCount ?? 0}/{item.usageLimit ?? "∞"} used</small></span><b>{item.isActive ? "Active" : "Paused"}</b></div>) : !error && <p className="manager-note">No promotion codes yet.</p>}</div></section><section className="content-card"><div className="section-heading"><div><p className="eyebrow">New code</p><h2>Create promotion</h2></div></div><form className="shop-form management-form" onSubmit={save}><label>Code<input required value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="WELCOME10" /></label><label>Discount type<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as "PERCENTAGE" | "FIXED" })}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select></label><label>{draft.type === "PERCENTAGE" ? "Percentage" : "Discount amount (cents)"}<input required min="1" type="number" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} /></label><label>Minimum order (cents)<input min="0" type="number" value={draft.minimumMinor} onChange={(event) => setDraft({ ...draft, minimumMinor: event.target.value })} /></label><label>Usage limit<input min="1" type="number" value={draft.usageLimit} onChange={(event) => setDraft({ ...draft, usageLimit: event.target.value })} /></label><label>Ends on<input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></label><button className="admin-action">Create promotion</button></form>{message && <p className="manager-note">{message}</p>}</section></div>;
}

function ModerationPanel() {
  const [items, setItems] = useState<ModerationItem[]>([]); const [error, setError] = useState(""); const [filter, setFilter] = useState("PENDING");
  useEffect(() => { let active = true; api<ModerationItem[] | { items: ModerationItem[] }>(`/shop/admin/comments?status=${filter}`).then((response) => { if (active) { setItems(Array.isArray(response) ? response : response.items); setError(""); } }).catch(() => { if (active) setError("Could not load the moderation queue."); }); return () => { active = false; }; }, [filter]);
  async function moderate(id: string, status: "PUBLISHED" | "HIDDEN") { try { await api(`/shop/admin/comments/${id}/moderation`, { method: "PATCH", body: JSON.stringify({ status }) }); setItems((current) => current.filter((item) => item.id !== id)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update comment."); } }
  return <section className="content-card"><div className="section-heading"><div><p className="eyebrow">Customer feedback</p><h2>Moderation queue</h2></div><label className="inline-field">Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option>PENDING</option><option>PUBLISHED</option><option>HIDDEN</option></select></label></div><EndpointNotice error={error} />{items.length ? <div className="moderation-list">{items.map((item) => <article key={item.id}><header><span><strong>{item.product?.name ?? "Product comment"}</strong><small>{item.author?.name ?? item.author?.email ?? "Customer"} · {new Date(item.createdAt).toLocaleDateString()}</small></span><b>{item.rating ? `★ ${item.rating}` : "No rating"}</b></header><p>{item.body}</p><footer><button className="text-button" onClick={() => void moderate(item.id, "PUBLISHED")}>Publish</button><button className="danger-text-button" onClick={() => void moderate(item.id, "HIDDEN")}>Hide</button></footer></article>)}</div> : !error && <p className="manager-note">There are no comments in this queue.</p>}</section>;
}

function ReportsPanel() {
  const [report, setReport] = useState<Report | null>(null); const [error, setError] = useState(""); const [range, setRange] = useState("30d");
  useEffect(() => { const to = new Date(); const from = new Date(to); from.setDate(to.getDate() - Number.parseInt(range, 10) + 1); const query = new URLSearchParams({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }); api<Report>(`/shop/admin/reports?${query}`).then(setReport).catch((reason: Error) => setError(reason.message)); }, [range]);
  const metrics = report?.metrics;
  function exportCsv() {
    if (!report?.topProducts?.length) return;
    const rows = [["Product", "Units sold", "Revenue"], ...report.topProducts.map((item) => [item.name, String(item.units), String(item.revenueMinor / 100)])];
    const blob = new Blob([rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nest-shop-report-${range}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Performance</p><h2>Shop reports</h2></div><label className="inline-field">Period<select value={range} onChange={(event) => setRange(event.target.value)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select></label></div><EndpointNotice error={error} /><div className="metric-grid management-metrics"><div className="metric-card"><span>Net sales</span><strong>{metrics ? money(metrics.netSalesMinor ?? 0) : "—"}</strong></div><div className="metric-card"><span>Orders</span><strong>{metrics?.orders ?? "—"}</strong></div><div className="metric-card"><span>Discounts</span><strong>{metrics ? money(metrics.discountsMinor ?? 0) : "—"}</strong></div><div className="metric-card"><span>Refunds recorded</span><strong>{metrics ? money(metrics.refundsMinor ?? 0) : "—"}</strong></div></div></section><section className="content-card"><div className="section-heading"><div><p className="eyebrow">Product performance</p><h2>Top products</h2></div><button className="text-button" type="button" disabled={!report?.topProducts?.length} onClick={exportCsv}>Export CSV</button></div>{report?.topProducts?.length ? <div className="table-wrap"><table className="data-table"><caption className="sr-only">Top products for the selected period</caption><thead><tr><th scope="col">Product</th><th scope="col">Units sold</th><th scope="col">Revenue</th></tr></thead><tbody>{report.topProducts.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.units}</td><td>{money(item.revenueMinor)}</td></tr>)}</tbody></table></div> : <p className="manager-note">Choose a period to view sales, favorites, stock risk and customer feedback trends.</p>}</section></>;
}

function AuditPanel() {
  const [items, setItems] = useState<AuditItem[]>([]); const [error, setError] = useState("");
  useEffect(() => { api<{ items: AuditItem[] } | AuditItem[]>("/shop/admin/audit").then((response) => setItems(Array.isArray(response) ? response : response.items)).catch(() => setError("Audit history will appear here for users with audit access.")); }, []);
  return <section className="content-card"><div className="section-heading"><div><p className="eyebrow">Governance</p><h2>Shop audit history</h2></div></div><EndpointNotice error={error} />{items.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.actor?.name ?? item.actor?.email ?? "System"}</td><td>{item.action.replaceAll("_", " ")}</td><td>{item.targetType}{item.targetId ? ` · ${item.targetId}` : ""}</td></tr>)}</tbody></table></div> : !error && <p className="manager-note">No matching shop activity yet.</p>}</section>;
}
