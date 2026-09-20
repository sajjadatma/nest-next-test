"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Order = {
  id: string;
  number: string;
  status: string;
  totalMinor: number;
  createdAt: string;
  items: { id: string; productName: string; quantity: number }[];
};
const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );

export function CustomerOrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<Order[]>("/shop/orders/mine")
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoaded(true));
  }, []);
  return (
    <section className="content-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Purchases</p>
          <h2>My orders</h2>
        </div>
      </div>
      {!loaded ? (
        <p className="manager-note">Loading orders…</p>
      ) : orders.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.number}</strong>
                    <small>
                      {new Date(order.createdAt).toLocaleDateString()}
                    </small>
                  </td>
                  <td>
                    {order.items
                      .map((item) => `${item.quantity} × ${item.productName}`)
                      .join(", ")}
                  </td>
                  <td>{money(order.totalMinor)}</td>
                  <td>
                    <span className="event-badge created">{order.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="manager-note">
          Orders placed while signed in will appear here.
        </p>
      )}
    </section>
  );
}
