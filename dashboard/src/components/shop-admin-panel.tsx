"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ShopAdminNavigation } from "@/components/shop-admin-navigation";
import { ShopOverviewPanel } from "@/components/shop-overview-panel";
import { CategoryManager } from "@/components/category-manager";
import { ShopManagementPanels } from "@/components/shop-management-panels";
import {
  emptyProduct,
  money,
  Order,
  OrderPage,
  OrderStatus,
  Product,
  ShopData,
  ShopSection,
  statuses,
} from "@/components/shop-admin-types";

export function ShopAdminPanel({ section = "overview", permissions }: { section?: ShopSection; permissions: string[] }) {
  const [data, setData] = useState<ShopData | null>(null);
  const [orders, setOrders] = useState<OrderPage | null>(null);
  const [product, setProduct] = useState(emptyProduct);
  const [editing, setEditing] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderQuery, setOrderQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [shipment, setShipment] = useState({ carrier: "", trackingNumber: "", service: "" });
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const can = (permission?: string) => permissions.includes("shop:manage") || Boolean(permission && permissions.includes(permission));
  const sectionPermission: Partial<Record<ShopSection, string>> = {
    products: "shop:catalog:manage", categories: "shop:catalog:manage", inventory: "shop:inventory:manage",
    orders: "shop:orders:read", shipping: "shop:shipping:manage", promotions: "shop:promotions:manage",
    moderation: "shop:comments:moderate", reports: "shop:analytics:read", audit: "shop:audit:read",
  };
  const canAccessSection = can(sectionPermission[section]);
  const needsOverview = ["overview", "products", "categories", "inventory"].includes(section);
  const needsOrders = ["overview", "orders"].includes(section);

  const loadOverview = useCallback(
    () =>
      api<ShopData>("/shop/admin/overview")
        .then(setData)
        .catch((reason: Error) => setError(reason.message)),
    [],
  );
  const loadOrders = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (appliedQuery) params.set("q", appliedQuery);
    if (orderStatus) params.set("status", orderStatus);
    return api<OrderPage>(`/shop/admin/orders?${params}`)
      .then(setOrders)
      .catch((reason: Error) => setError(reason.message));
  }, [appliedQuery, orderStatus, page]);

  useEffect(() => {
    if (needsOverview && canAccessSection) void loadOverview();
  }, [canAccessSection, loadOverview, needsOverview]);
  useEffect(() => {
    if (needsOrders && canAccessSection) void loadOrders();
  }, [canAccessSection, loadOrders, needsOrders]);
  useEffect(() => {
    if (!selectedOrder) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedOrder(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selectedOrder]);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const body = JSON.stringify({
        ...product,
        priceMinor: Number(product.priceMinor),
        stockQty: Number(product.stockQty),
        featuredRank: product.featuredRank ? Number(product.featuredRank) : null,
        galleryUrls: product.galleryUrls.split("\n").map((url) => url.trim()).filter(Boolean),
      });
      await api(
        editing ? `/shop/admin/products/${editing}` : "/shop/admin/products",
        { method: editing ? "PUT" : "POST", body },
      );
      setProduct(emptyProduct);
      setEditing(null);
      setMessage(editing ? "Product updated." : "Product created.");
      await loadOverview();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save product.",
      );
    }
  }

  async function updateOrder(order: Order, status: OrderStatus) {
    const reason =
      status === "CANCELLED" ? window.prompt("Cancellation reason") : undefined;
    if (status === "CANCELLED" && reason === null) return;
    setError("");
    try {
      const updated = await api<Order>(
        `/shop/admin/orders/${order.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status, reason: reason || undefined }),
        },
      );
      setSelectedOrder(updated);
      setMessage(
        status === "CANCELLED"
          ? "Order cancelled and inventory restored."
          : "Order status updated.",
      );
      await Promise.all([loadOrders(), loadOverview()]);
    } catch (reasonValue) {
      setError(
        reasonValue instanceof Error
          ? reasonValue.message
          : "Could not update order.",
      );
    }
  }

  async function saveOrderNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder || !orderNote.trim()) return;
    setError("");
    try {
      await api(`/shop/admin/orders/${selectedOrder.id}/notes`, { method: "POST", body: JSON.stringify({ body: orderNote.trim(), isCustomerVisible: false }) });
      setOrderNote("");
      setMessage("Internal order note added.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add the order note.");
    }
  }

  async function saveShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    setError("");
    try {
      await api(`/shop/admin/orders/${selectedOrder.id}/shipment`, { method: "PUT", body: JSON.stringify(shipment) });
      setMessage("Shipment and tracking details saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save shipment details.");
    }
  }

  function editProduct(item: Product) {
    setEditing(item.id);
    setProduct({
      name: item.name,
      slug: item.slug,
      description: item.description,
      priceMinor: String(item.priceMinor),
      stockQty: String(item.stockQty),
      categoryId: item.categoryId,
      imageUrl: item.imageUrl ?? "",
      material: item.material ?? "",
      dimensions: item.dimensions ?? "",
      care: item.care ?? "",
      featuredRank: item.featuredRank ? String(item.featuredRank) : "",
      galleryUrls: item.images.map((image) => image.url).join("\n"),
      isActive: item.isActive,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!canAccessSection)
    return <section className="content-card"><p className="manager-note">You do not have access to this shop management section.</p></section>;
  if ((needsOverview && !data) || (needsOrders && !orders))
    return (
      <section className="content-card">
        <p className="manager-note">Loading shop controls…</p>
        {error && <p className="notice error">{error}</p>}
      </section>
    );
  return (
    <section className="shop-admin">
      {message && <p className="notice success">{message}</p>}
      {error && <p className="notice error">{error}</p>}
      <ShopAdminNavigation active={section} permissions={permissions} />
      {section === "overview" && data && orders && <ShopOverviewPanel data={data} orders={orders} />}
      <ShopManagementPanels section={section} products={data?.products ?? []} />
      <div
        className={`shop-admin-grid ${section}`}
        hidden={section !== "products"}
      >
        <section className="content-card" hidden={section !== "products"}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Inventory</p>
              <h2>{editing ? "Edit product" : "Add product"}</h2>
            </div>
            {editing && (
              <button
                className="text-button"
                onClick={() => {
                  setEditing(null);
                  setProduct(emptyProduct);
                }}
              >
                New product
              </button>
            )}
          </div>
          <form className="shop-form" onSubmit={saveProduct}>
            <label>
              Product name
              <input
                required
                value={product.name}
                onChange={(event) =>
                  setProduct({ ...product, name: event.target.value })
                }
              />
            </label>
            <label>
              URL slug
              <input
                required
                value={product.slug}
                onChange={(event) =>
                  setProduct({ ...product, slug: event.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                required
                value={product.description}
                onChange={(event) =>
                  setProduct({ ...product, description: event.target.value })
                }
              />
            </label>
            <label>
              Material
              <input
                value={product.material}
                onChange={(event) => setProduct({ ...product, material: event.target.value })}
              />
            </label>
            <label>
              Dimensions
              <input
                value={product.dimensions}
                onChange={(event) => setProduct({ ...product, dimensions: event.target.value })}
              />
            </label>
            <label>
              Care instructions
              <textarea
                value={product.care}
                onChange={(event) => setProduct({ ...product, care: event.target.value })}
              />
            </label>
            <div>
              <label>
                Price in cents
                <input
                  required
                  type="number"
                  min="0"
                  value={product.priceMinor}
                  onChange={(event) =>
                    setProduct({ ...product, priceMinor: event.target.value })
                  }
                />
              </label>
              <label>
                Stock quantity
                <input
                  required
                  type="number"
                  min="0"
                  value={product.stockQty}
                  onChange={(event) =>
                    setProduct({ ...product, stockQty: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Category
              <select
                required
                value={product.categoryId}
                onChange={(event) =>
                  setProduct({ ...product, categoryId: event.target.value })
                }
              >
                <option value="">Choose a category</option>
                {(data?.categories ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Image URL
              <input
                value={product.imageUrl}
                onChange={(event) =>
                  setProduct({ ...product, imageUrl: event.target.value })
                }
              />
            </label>
            <label>
              Gallery image URLs (one per line)
              <textarea
                value={product.galleryUrls}
                onChange={(event) => setProduct({ ...product, galleryUrls: event.target.value })}
              />
            </label>
            <label>
              Featured position
              <input
                type="number"
                min="1"
                placeholder="Leave blank for not featured"
                value={product.featuredRank}
                onChange={(event) => setProduct({ ...product, featuredRank: event.target.value })}
              />
            </label>
            <label className="role-check">
              <input
                type="checkbox"
                checked={product.isActive}
                onChange={(event) =>
                  setProduct({ ...product, isActive: event.target.checked })
                }
              />
              Visible in shop
            </label>
            <button className="admin-action" type="submit">
              {editing ? "Save product" : "Create product"}
            </button>
          </form>
        </section>
      </div>
      {section === "categories" && (
        <CategoryManager
          categories={data?.categories ?? []}
          onChanged={loadOverview}
          onMessage={setMessage}
          onError={setError}
        />
      )}
      <section className="content-card" hidden={section !== "products"}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Catalogue</p>
            <h2>Products &amp; stock</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table shop-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Storefront</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.products ?? []).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <small>/{item.slug}</small>
                  </td>
                  <td>{item.category.name}</td>
                  <td>{money(item.priceMinor)}</td>
                  <td>{item.stockQty}</td>
                  <td>
                    <span
                      className={`event-badge ${item.isActive ? "created" : "login"}`}
                    >
                      {item.isActive ? "Live" : "Hidden"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => editProduct(item)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="content-card" hidden={section !== "orders"}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Fulfilment</p>
            <h2>Orders</h2>
          </div>
          <span className="status-dot">{orders?.total ?? 0} total</span>
        </div>
        <form
          className="order-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setAppliedQuery(orderQuery.trim());
          }}
        >
          <label>
            Search
            <input
              value={orderQuery}
              onChange={(event) => setOrderQuery(event.target.value)}
              placeholder="Order, email, or phone"
            />
          </label>
          <label>
            Status
            <select
              value={orderStatus}
              onChange={(event) => {
                setPage(1);
                setOrderStatus(event.target.value);
              }}
            >
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <button className="admin-action" type="submit">
            Search
          </button>
        </form>
        <div className="table-wrap">
          <table className="data-table shop-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(orders?.items ?? []).map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.number}</strong>
                    <small>{new Date(order.createdAt).toLocaleString()}</small>
                  </td>
                  <td>
                    <strong>
                      {order.shippingAddress.fullName ?? "Customer"}
                    </strong>
                    <small>
                      {order.email}
                      <br />
                      {order.phone}
                    </small>
                  </td>
                  <td>
                    {order.items
                      .map((item) => `${item.quantity} × ${item.productName}`)
                      .join(", ")}
                  </td>
                  <td>{money(order.totalMinor)}</td>
                  <td>
                    <select
                      aria-label={`Status for ${order.number}`}
                      value={order.status}
                      disabled={
                        order.status === "FULFILLED" ||
                        order.status === "CANCELLED"
                      }
                      onChange={(event) =>
                        void updateOrder(
                          order,
                          event.target.value as OrderStatus,
                        )
                      }
                    >
                      <option>{order.status}</option>
                      {order.status === "PENDING" && (
                        <>
                          <option>CONFIRMED</option>
                          <option>CANCELLED</option>
                        </>
                      )}
                      {order.status === "CONFIRMED" && (
                        <>
                          <option>FULFILLED</option>
                          <option>CANCELLED</option>
                        </>
                      )}
                    </select>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setSelectedOrder(order)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!orders?.items.length && (
          <p className="manager-note">No orders match these filters.</p>
        )}
        <div className="pagination">
          <button
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>
            Page {orders?.page ?? 1} of {orders?.pages ?? 1}
          </span>
          <button
            disabled={page >= (orders?.pages ?? 1)}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </div>
      </section>
      {selectedOrder && (
        <div className="admin-order-overlay">
          <aside
            className="admin-order-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-detail-title"
          >
            <header>
              <div>
                <p className="eyebrow">Order detail</p>
                <h2 id="order-detail-title">{selectedOrder.number}</h2>
              </div>
              <button
                aria-label="Close order detail"
                onClick={() => setSelectedOrder(null)}
              >
                ×
              </button>
            </header>
            <dl>
              <div>
                <dt>Customer</dt>
                <dd>
                  {selectedOrder.shippingAddress.fullName}
                  <br />
                  {selectedOrder.email}
                  <br />
                  {selectedOrder.phone}
                </dd>
              </div>
              <div>
                <dt>Delivery address</dt>
                <dd>
                  {selectedOrder.shippingAddress.line1}
                  <br />
                  {selectedOrder.shippingAddress.city},{" "}
                  {selectedOrder.shippingAddress.postalCode}
                  <br />
                  {selectedOrder.shippingAddress.country}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {selectedOrder.status}
                  {selectedOrder.cancellationReason && (
                    <>
                      <br />
                      {selectedOrder.cancellationReason}
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Delivery method</dt>
                <dd>{selectedOrder.shippingLabel}<br />{selectedOrder.shippingEta}</dd>
              </div>
            </dl>
            <div className="confirmation-lines">
              {selectedOrder.items.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.quantity} × {item.productName}
                  </span>
                </div>
              ))}
              <div><span>Subtotal</span><strong>{money(selectedOrder.subtotalMinor)}</strong></div>
              <div><span>Delivery</span><strong>{selectedOrder.shippingMinor ? money(selectedOrder.shippingMinor) : "Included"}</strong></div>
              <div><span>Total</span><strong>{money(selectedOrder.totalMinor)}</strong></div>
            </div>
            <section className="order-operations" aria-label="Fulfilment operations">
              <div>
                <p className="eyebrow">Shipment</p>
                <h3>Tracking details</h3>
              </div>
              <form className="shop-form compact-form" onSubmit={saveShipment}>
                <label>Carrier<input value={shipment.carrier} onChange={(event) => setShipment({ ...shipment, carrier: event.target.value })} placeholder="Carrier name" /></label>
                <label>Service<input value={shipment.service} onChange={(event) => setShipment({ ...shipment, service: event.target.value })} placeholder="Express / Standard" /></label>
                <label>Tracking number<input value={shipment.trackingNumber} onChange={(event) => setShipment({ ...shipment, trackingNumber: event.target.value })} placeholder="Tracking reference" /></label>
                <button className="admin-action" type="submit">Save shipment</button>
              </form>
              <p className="manager-note">Saving shipment data and the expanded Packing → Shipped workflow activate with the fulfilment API.</p>
              <form className="shop-form compact-form" onSubmit={saveOrderNote}>
                <label>Internal note<textarea value={orderNote} onChange={(event) => setOrderNote(event.target.value)} placeholder="Visible only to authorised shop staff" /></label>
                <button className="text-button" type="submit">Add note</button>
              </form>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
