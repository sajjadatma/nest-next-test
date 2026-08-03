"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Order = {
  number: string;
  status: string;
  totalMinor: number;
  subtotalMinor: number;
  shippingMinor: number;
  shippingLabel: string;
  shippingEta: string;
  phone: string;
  email: string;
  createdAt: string;
  confirmationEmailStatus: string;
  shippingAddress: {
    fullName: string;
    line1: string;
    city: string;
    postalCode: string;
    country: string;
  };
  items: {
    id: string;
    productName: string;
    unitPriceMinor: number;
    quantity: number;
  }[];
};
const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );

export function OrderConfirmation({ token }: { token: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Order>(`/shop/orders/confirmation/${encodeURIComponent(token)}`)
      .then(setOrder)
      .catch((reason: Error) => setError(reason.message));
  }, [token]);
  if (error)
    return (
      <main className="confirmation-page">
        <section>
          <p className="shop-kicker">Order confirmation</p>
          <h1>We couldn’t find that order.</h1>
          <p>{error}</p>
          <Link href="/shop">Return to shop</Link>
        </section>
      </main>
    );
  if (!order)
    return (
      <main className="confirmation-page">
        <section>
          <p>Loading your order…</p>
        </section>
      </main>
    );
  return (
    <main className="confirmation-page">
      <section>
        <p className="shop-kicker">Order received</p>
        <h1>Thank you, {order.shippingAddress.fullName}.</h1>
        <p>
          Your order <strong>{order.number}</strong> is safely recorded. Payment
          will be collected on delivery.
        </p>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{order.status}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>
              {order.email}
              <br />
              {order.phone}
            </dd>
          </div>
          <div>
            <dt>Deliver to</dt>
            <dd>
              {order.shippingAddress.line1}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.postalCode}
              <br />
              {order.shippingAddress.country}
            </dd>
          </div>
          <div>
            <dt>Delivery method</dt>
            <dd>{order.shippingLabel}<br />{order.shippingEta}</dd>
          </div>
        </dl>
        <div className="confirmation-lines">
          {order.items.map((item) => (
            <div key={item.id}>
              <span>
                {item.quantity} × {item.productName}
              </span>
              <strong>{money(item.unitPriceMinor * item.quantity)}</strong>
            </div>
          ))}
          <div>
            <span>Subtotal</span>
            <strong>{money(order.subtotalMinor)}</strong>
          </div>
          <div>
            <span>{order.shippingLabel}</span>
            <strong>{order.shippingMinor ? money(order.shippingMinor) : "Included"}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{money(order.totalMinor)}</strong>
          </div>
        </div>
        <p className="confirmation-note">
          {order.confirmationEmailStatus === "SENT"
            ? "A copy of this confirmation was emailed to you."
            : "Save this page or order number for your records."}
        </p>
        <Link className="shop-cta" href="/shop">
          Continue shopping
        </Link>
      </section>
    </main>
  );
}
