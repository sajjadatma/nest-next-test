"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, clear, restoreSession, token } from "@/lib/api";
import { money } from "@/components/shop-types";

type Account = { name?: string | null; email: string };
type CustomerOrder = { id: string; number: string; status: string; totalMinor: number; createdAt: string; items: { id: string; productName: string; quantity: number }[] };

const orderStatusLabels: Record<string, string> = {
  PENDING: "Order received",
  CONFIRMED: "Confirmed",
  PACKING: "Preparing",
  SHIPPED: "On the way",
  DELIVERED: "Delivered",
  FULFILLED: "Complete",
  CANCELLED: "Cancelled",
};

export function CustomerAccountClient() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!token() && !await restoreSession()) {
          router.replace("/login?redirect=%2Fshop%2Faccount");
          return;
        }
        const [profile, customerOrders] = await Promise.all([
          api<Account>("/auth/me"),
          api<CustomerOrder[]>("/shop/orders/mine"),
        ]);
        if (active) { setAccount(profile); setOrders(customerOrders); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "We could not load your account.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [router]);

  function signOut() {
    void api("/auth/logout", { method: "POST" }).catch(() => undefined);
    clear();
    router.replace("/shop");
  }

  if (loading) return <main className="account-page" aria-busy="true"><p className="shop-kicker">Your account</p><h1>Loading your orders…</h1></main>;
  if (!account) return <main className="account-page"><div className="account-state error" role="alert"><p>{error || "We could not load your account."}</p><Link className="shop-primary" href="/login?redirect=%2Fshop%2Faccount">Sign in again</Link></div></main>;

  return <main className="account-page">
    <header className="account-heading"><div><p className="shop-kicker">Your NEST account</p><h1>Good to see you, {account.name?.split(" ")[0] || "there"}.</h1><p>Keep your delivery details and order history close at hand.</p></div><button className="account-signout" type="button" onClick={signOut}>Sign out</button></header>
    <div className="account-layout">
      <aside className="account-card"><p className="shop-kicker">Details</p><h2>{account.name || "NEST customer"}</h2><p>{account.email}</p><Link href="/shop#collection">Continue shopping →</Link></aside>
      <section className="account-card" aria-labelledby="orders-title"><div className="account-section-heading"><div><p className="shop-kicker">Your history</p><h2 id="orders-title">Orders</h2></div><span>{orders.length} {orders.length === 1 ? "order" : "orders"}</span></div>{error ? <div className="account-state error" role="alert"><p>{error}</p><button className="shop-secondary" type="button" onClick={() => window.location.reload()}>Try again</button></div> : orders.length ? <div className="account-orders">{orders.map((order) => <article key={order.id}><div><strong>{order.number}</strong><small>{new Date(order.createdAt).toLocaleDateString()}</small></div><p>{order.items.map((item) => `${item.quantity} × ${item.productName}`).join(", ")}</p><div><span className={`order-status ${order.status.toLowerCase()}`}>{orderStatusLabels[order.status] ?? order.status}</span><strong>{money(order.totalMinor)}</strong></div></article>)}</div> : <div className="account-state"><h3>No orders yet.</h3><p>Orders placed while signed in will appear here.</p><Link className="shop-primary" href="/shop#collection">Explore the collection</Link></div>}</section>
    </div>
  </main>;
}
