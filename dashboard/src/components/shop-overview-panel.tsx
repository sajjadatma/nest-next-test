import Link from "next/link";
import { OrderPage, ShopData, money } from "@/components/shop-admin-types";

export function ShopOverviewPanel({ data, orders }: { data: ShopData; orders: OrderPage }) {
  const lowStock = data.products.filter((product) => product.stockQty <= 5);
  const openOrders = orders.items.filter((order) =>
    order.status === "PENDING" || order.status === "CONFIRMED",
  ).length;

  return (
    <>
      <section className="metric-grid shop-metrics" aria-label="Shop performance">
        <article className="metric-card"><span>Products</span><strong>{data.metrics.products}</strong><small>{lowStock.length} need stock attention</small></article>
        <article className="metric-card"><span>Total orders</span><strong>{data.metrics.orders}</strong><small>{openOrders} currently open</small></article>
        <article className="metric-card"><span>Customers</span><strong>{data.metrics.customers}</strong><small>Unique purchasers</small></article>
        <article className="metric-card"><span>Confirmed sales</span><strong>{money(data.metrics.revenueMinor)}</strong><small>Excludes cancelled orders</small></article>
      </section>
      <div className="shop-overview-grid">
        <section className="content-card">
          <div className="section-heading"><div><p className="eyebrow">Attention</p><h2>Inventory watchlist</h2></div><Link className="text-button" href="/dashboard/shop/products">Manage products</Link></div>
          <div className="admin-list overview-list">
            {lowStock.slice(0, 5).map((product) => <div key={product.id}><strong>{product.name}</strong><span>{product.stockQty === 0 ? "Out of stock" : `${product.stockQty} remaining`}</span></div>)}
            {!lowStock.length && <p className="manager-note">All products have healthy stock.</p>}
          </div>
        </section>
        <section className="content-card">
          <div className="section-heading"><div><p className="eyebrow">Latest activity</p><h2>Recent orders</h2></div><Link className="text-button" href="/dashboard/shop/orders">View all orders</Link></div>
          <div className="admin-list overview-list">
            {orders.items.slice(0, 5).map((order) => <div key={order.id}><strong>{order.number}</strong><span>{order.status} · {money(order.totalMinor)}</span></div>)}
            {!orders.items.length && <p className="manager-note">No orders have arrived yet.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
