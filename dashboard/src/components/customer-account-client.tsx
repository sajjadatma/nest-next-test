"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { api, clear, restoreSession, token } from "@/lib/api";
import { money } from "@/components/shop-types";

type Profile = { name?: string | null; email: string; profile: { phone?: string | null; locale: string; timezone: string }; preferences: { emailMarketing: boolean; emailOrderUpdates: boolean; smsOrderUpdates: boolean } };
type Address = { id: string; label?: string | null; recipientName: string; line1: string; city: string; postalCode: string; countryCode: string; isDefaultShipping: boolean; isDefaultBilling: boolean };
type CustomerOrder = { id: string; number: string; status: string; totalMinor: number; createdAt: string; items: { id: string; productName: string; quantity: number }[]; shipments?: { trackingNumber?: string | null; status: string }[]; payments?: { status: string; amountMinor: number; methodType: string }[] };
type Payment = { id: string; orderId: string; status: string; amountMinor: number; methodType: string; createdAt: string; paidAt?: string | null };
type Session = { id: string; createdAt: string; expiresAt: string };
type AddressForm = { recipientName: string; line1: string; city: string; postalCode: string; countryCode: string; phone: string };
type PreferencesForm = { emailOrderUpdates: boolean; emailMarketing: boolean; smsOrderUpdates: boolean };

const orderStatusLabels: Record<string, string> = { PENDING: "Order received", CONFIRMED: "Confirmed", PACKING: "Preparing", SHIPPED: "On the way", DELIVERED: "Delivered", FULFILLED: "Complete", CANCELLED: "Cancelled" };

export function CustomerAccountClient() {
  const router = useRouter();
  const [account, setAccount] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<AddressForm>({ defaultValues: { recipientName: "", line1: "", city: "", postalCode: "", countryCode: "US", phone: "" } });
  const preferencesForm = useForm<PreferencesForm>({ defaultValues: { emailOrderUpdates: true, emailMarketing: false, smsOrderUpdates: false } });
  const { reset: resetPreferences } = preferencesForm;

  const load = useCallback(async () => {
    if (!token() && !await restoreSession()) { router.replace("/login?redirect=%2Fshop%2Faccount"); return; }
    const [profile, orderPage, savedAddresses, paymentHistory, activeSessions] = await Promise.all([api<Profile>("/account/profile"), api<{ items: CustomerOrder[] }>("/account/orders"), api<Address[]>("/account/addresses"), api<Payment[]>("/account/payments"), api<Session[]>("/account/sessions")]);
    setAccount(profile); setOrders(orderPage.items); setAddresses(savedAddresses); setPayments(paymentHistory); setSessions(activeSessions); resetPreferences(profile.preferences);
  }, [resetPreferences, router]);
  useEffect(() => { queueMicrotask(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "We could not load your account.")).finally(() => setLoading(false)); }); }, [load]);

  async function addAddress(values: AddressForm) {
    try { const created = await api<Address>("/account/addresses", { method: "POST", body: JSON.stringify({ ...values, type: "BOTH", isDefaultShipping: addresses.length === 0, isDefaultBilling: addresses.length === 0 }) }); setAddresses((current) => [...current, created]); reset(); setMessage("Address saved."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save address."); }
  }
  async function savePreferences(values: PreferencesForm) { try { const preferences = await api<Profile["preferences"]>("/account/preferences", { method: "PATCH", body: JSON.stringify(values) }); setAccount((current) => current ? { ...current, preferences } : current); setMessage("Preferences saved."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save preferences."); } }
  async function exportData() { try { const data = await api<unknown>("/account/export", { method: "POST" }); const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "nest-account-export.json"; link.click(); URL.revokeObjectURL(url); setMessage("Your account export is ready."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not export your data."); } }
  async function requestDeletion() { if (!window.confirm("Request account deletion? Your account will be signed out and scheduled for removal.")) return; try { await api("/account/deletion-request", { method: "POST", body: JSON.stringify({}) }); setMessage("Deletion requested. Contact support if you need to cancel it."); clear(); router.replace("/shop"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not request account deletion."); } }
  async function revokeSession(id: string) { try { await api(`/account/sessions/${id}`, { method: "DELETE" }); setSessions((current) => current.filter((session) => session.id !== id)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not revoke this session."); } }
  function signOut() { void api("/auth/logout", { method: "POST" }).catch(() => undefined); clear(); router.replace("/shop"); }

  if (loading) return <main className="account-page" aria-busy="true"><p className="shop-kicker">Your account</p><h1>Loading your account…</h1></main>;
  if (!account) return <main className="account-page"><div className="account-state error" role="alert"><p>{error || "We could not load your account."}</p><Link className="shop-primary" href="/login?redirect=%2Fshop%2Faccount">Sign in again</Link></div></main>;
  return <main className="account-page">
    <header className="account-heading"><div><p className="shop-kicker">Your NEST account</p><h1>Good to see you, {account.name?.split(" ")[0] || "there"}.</h1><p>Keep your profile, delivery details, orders, and payment history together.</p></div><button className="account-signout" type="button" onClick={signOut}>Sign out</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
    <div className="account-layout">
      <aside className="account-card"><p className="shop-kicker">Details</p><h2>{account.name || "NEST customer"}</h2><p>{account.email}</p><p>{account.profile.phone || "No phone added"}</p><Link href="/shop#collection">Continue shopping →</Link></aside>
      <section className="account-card" aria-labelledby="orders-title"><div className="account-section-heading"><div><p className="shop-kicker">Your history</p><h2 id="orders-title">Orders</h2></div><span>{orders.length} {orders.length === 1 ? "order" : "orders"}</span></div>{orders.length ? <div className="account-orders">{orders.map((order) => <article key={order.id}><div><strong>{order.number}</strong><small>{new Date(order.createdAt).toLocaleDateString()}</small></div><p>{order.items.map((item) => `${item.quantity} × ${item.productName}`).join(", ")}</p><div><span className={`order-status ${order.status.toLowerCase()}`}>{orderStatusLabels[order.status] ?? order.status}</span><strong>{money(order.totalMinor)}</strong></div></article>)}</div> : <div className="account-state"><h3>No orders yet.</h3><p>Orders placed while signed in will appear here.</p></div>}</section>
    </div>
    <section className="account-card"><div className="account-section-heading"><div><p className="shop-kicker">Delivery</p><h2>Saved addresses</h2></div></div><div className="account-orders">{addresses.map((address) => <article key={address.id}><div><strong>{address.label || address.recipientName}</strong><small>{address.isDefaultShipping ? "Default shipping" : "Saved address"}</small></div><p>{address.line1}, {address.city}, {address.postalCode}, {address.countryCode}</p></article>)}</div><form className="form" onSubmit={handleSubmit(addAddress)}><h3>Add an address</h3><div className="checkout-two"><label>Recipient<input {...register("recipientName", { required: true })} /></label><label>Phone<input {...register("phone")} /></label></div><label>Street address<input {...register("line1", { required: true })} /></label><div className="checkout-two"><label>City<input {...register("city", { required: true })} /></label><label>Postal code<input {...register("postalCode", { required: true })} /></label></div><label>Country code<input maxLength={2} {...register("countryCode", { required: true, minLength: 2, maxLength: 2 })} /></label><button className="shop-primary" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save address"}</button></form></section>
    <section className="account-card"><div className="account-section-heading"><div><p className="shop-kicker">Payments</p><h2>Payment history</h2></div></div>{payments.length ? <div className="account-orders">{payments.map((payment) => <article key={payment.id}><div><strong>{payment.methodType.replaceAll("_", " ")}</strong><small>{new Date(payment.createdAt).toLocaleDateString()}</small></div><p>Order {payment.orderId}</p><div><span className={`order-status ${payment.status.toLowerCase()}`}>{payment.status}</span><strong>{money(payment.amountMinor)}</strong></div></article>)}</div> : <p className="manager-note">Payment history will appear after your first order.</p>}</section>
    <section className="account-card"><div className="account-section-heading"><div><p className="shop-kicker">Preferences</p><h2>Communication</h2></div></div><form className="form" onSubmit={preferencesForm.handleSubmit(savePreferences)}><label><input type="checkbox" {...preferencesForm.register("emailOrderUpdates")} /> Email order updates</label><label><input type="checkbox" {...preferencesForm.register("emailMarketing")} /> Product and collection news</label><label><input type="checkbox" {...preferencesForm.register("smsOrderUpdates")} /> SMS delivery updates</label><button className="shop-secondary" disabled={preferencesForm.formState.isSubmitting}>{preferencesForm.formState.isSubmitting ? "Saving…" : "Save preferences"}</button></form></section>
    <section className="account-card"><div className="account-section-heading"><div><p className="shop-kicker">Privacy &amp; security</p><h2>Account controls</h2></div></div><p className="manager-note">{sessions.length} active session{sessions.length === 1 ? "" : "s"}</p><div className="account-orders">{sessions.map((session) => <article key={session.id}><div><strong>Signed-in session</strong><small>Started {new Date(session.createdAt).toLocaleString()}</small></div><button className="text-button" type="button" onClick={() => void revokeSession(session.id)}>Revoke</button></article>)}</div><div className="promotion-actions"><button className="shop-secondary" type="button" onClick={() => void exportData()}>Download my data</button><button className="danger-text-button" type="button" onClick={() => void requestDeletion()}>Request account deletion</button></div></section>
  </main>;
}
