"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api, restoreSession } from "@/lib/api";

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceMinor: number;
  currency: string;
  imageUrl: string | null;
  stockQty: number;
  category: { name: string; slug: string };
};
type Category = { name: string; slug: string; _count: { products: number } };
type CartLine = Product & { quantity: number };
type Checkout = {
  email: string;
  phone: string;
  fullName: string;
  line1: string;
  city: string;
  postalCode: string;
  country: string;
};

const money = (minor: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    minor / 100,
  );

export function ShopClient() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [showCart, setShowCart] = useState(false);
  const [checkout, setCheckout] = useState<Checkout>({
    email: "",
    phone: "",
    fullName: "",
    line1: "",
    city: "",
    postalCode: "",
    country: "",
  });
  const [checkoutKeys, setCheckoutKeys] = useState(() => ({
    idempotencyKey: crypto.randomUUID(),
    confirmationToken: crypto.randomUUID(),
  }));
  const [cartReady, setCartReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    Promise.all([
      api<Product[]>("/shop/products"),
      api<Category[]>("/shop/categories"),
    ])
      .then(([items, groups]) => {
        setProducts(items);
        setCategories(groups);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);
  useEffect(() => {
    void restoreSession();
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nest-shop-cart");
      if (saved) setCart(JSON.parse(saved) as CartLine[]);
    } finally {
      setCartReady(true);
    }
  }, []);
  useEffect(() => {
    if (cartReady) localStorage.setItem("nest-shop-cart", JSON.stringify(cart));
  }, [cart, cartReady]);
  useEffect(() => {
    if (!showCart) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowCart(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [showCart]);
  const visible = useMemo(
    () =>
      products.filter(
        (product) =>
          (!category || product.category.slug === category) &&
          (!query ||
            `${product.name} ${product.description}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [products, category, query],
  );
  const subtotal = cart.reduce(
    (total, line) => total + line.priceMinor * line.quantity,
    0,
  );
  const add = (product: Product) => {
    setCart((current) => {
      const found = current.find((line) => line.id === product.id);
      if (found)
        return current.map((line) =>
          line.id === product.id
            ? {
                ...line,
                quantity: Math.min(line.quantity + 1, product.stockQty),
              }
            : line,
        );
      return [...current, { ...product, quantity: 1 }];
    });
    setNotice(`${product.name} added to your bag.`);
  };
  const update = (id: string, quantity: number) =>
    setCart((current) =>
      current.flatMap((line) =>
        quantity < 1
          ? []
          : [{ ...line, quantity: Math.min(quantity, line.stockQty) }],
      ),
    );
  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await restoreSession();
      const order = await api<{ number: string; confirmationToken: string }>(
        "/shop/orders",
        {
          method: "POST",
          body: JSON.stringify({
            ...checkoutKeys,
            email: checkout.email,
            phone: checkout.phone,
            items: cart.map(({ id, quantity }) => ({
              productId: id,
              quantity,
            })),
            shippingAddress: {
              fullName: checkout.fullName,
              line1: checkout.line1,
              city: checkout.city,
              postalCode: checkout.postalCode,
              country: checkout.country,
            },
          }),
        },
      );
      setCart([]);
      setShowCart(false);
      setCheckoutKeys({
        idempotencyKey: crypto.randomUUID(),
        confirmationToken: crypto.randomUUID(),
      });
      router.push(`/shop/order/${order.confirmationToken}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We couldn’t place your order.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="shop-shell">
      <header className="shop-nav">
        <a className="shop-logo" href="/shop">
          NEST<span>™</span>
        </a>
        <nav>
          <a href="#collection">Collection</a>
          <a href="#about">Our approach</a>
        </nav>
        <button
          className="bag-button"
          onClick={() => setShowCart(true)}
          aria-label="Open shopping bag"
        >
          Bag{" "}
          <span>{cart.reduce((total, line) => total + line.quantity, 0)}</span>
        </button>
      </header>
      <section className="shop-hero">
        <p className="shop-kicker">Small objects, well chosen</p>
        <h1>
          Make room
          <br />
          for better <em>everyday.</em>
        </h1>
        <p>Useful things with quiet character—made to stay in the rotation.</p>
        <a href="#collection" className="shop-cta">
          Shop the collection <span>↓</span>
        </a>
        <div className="hero-shape" aria-hidden>
          <span />
        </div>
      </section>
      <section className="shop-collection" id="collection">
        <div className="collection-top">
          <div>
            <p className="shop-kicker">The current edit</p>
            <h2>Made for the long run.</h2>
          </div>
          <label className="shop-search">
            <span className="sr-only">Search products</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the collection"
            />
          </label>
        </div>
        <div className="shop-filters">
          <button
            className={!category ? "selected" : ""}
            onClick={() => setCategory("")}
          >
            All pieces <span>{products.length}</span>
          </button>
          {categories.map((group) => (
            <button
              key={group.slug}
              className={category === group.slug ? "selected" : ""}
              onClick={() => setCategory(group.slug)}
            >
              {group.name} <span>{group._count.products}</span>
            </button>
          ))}
        </div>
        {error && <p className="shop-message error">{error}</p>}
        <div className="product-grid">
          {visible.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-image">
                    {product.imageUrl && <Image src={product.imageUrl} alt="" fill unoptimized sizes="(max-width: 540px) 100vw, (max-width: 850px) 50vw, 25vw" />}
                <span>{product.category.name}</span>
              </div>
              <div className="product-details">
                <div>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                </div>
                <div className="product-bottom">
                  <strong>{money(product.priceMinor, product.currency)}</strong>
                  <button
                    onClick={() => add(product)}
                    disabled={!product.stockQty}
                  >
                    {product.stockQty ? "Add to bag" : "Sold out"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="shop-story" id="about">
        <div>
          <p className="shop-kicker">Fewer, better things</p>
          <h2>Objects should earn their place.</h2>
        </div>
        <p>
          We look for good material, honest utility, and the kind of detail you
          notice over time. The aim is not more stuff. It’s the right stuff.
        </p>
      </section>
      <footer className="shop-footer">
        <span>NEST™ / 2026</span>
        <span>Made for daily use.</span>
        <a href="/login">Account</a>
      </footer>
      {notice && (
        <div className="shop-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {showCart && (
        <div className="cart-overlay">
          <aside
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bag-title"
          >
            <header>
              <div>
                <p className="shop-kicker">Your selection</p>
                <h2 id="bag-title">Shopping bag</h2>
              </div>
              <button onClick={() => setShowCart(false)} aria-label="Close bag">
                ×
              </button>
            </header>
            {cart.length === 0 ? (
              <p className="empty-bag">
                Your bag is waiting for something good.
              </p>
            ) : (
              <>
                <div className="cart-lines">
                  {cart.map((line) => (
                    <div className="cart-line" key={line.id}>
                      <div>
                        <strong>{line.name}</strong>
                        <span>{money(line.priceMinor, line.currency)}</span>
                      </div>
                      <div className="quantity">
                        <button
                          onClick={() => update(line.id, line.quantity - 1)}
                          aria-label={`Remove one ${line.name}`}
                        >
                          −
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          onClick={() => update(line.id, line.quantity + 1)}
                          aria-label={`Add one ${line.name}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-total">
                  <span>Subtotal</span>
                  <strong>{money(subtotal)}</strong>
                  <small>
                    Delivery is included. Payment is collected on delivery.
                  </small>
                </div>
                <form className="checkout-form" onSubmit={placeOrder}>
                  <h3>Delivery details</h3>
                  <label>
                    Email address
                    <input
                      type="email"
                      required
                      value={checkout.email}
                      onChange={(e) =>
                        setCheckout({ ...checkout, email: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Phone number
                    <input
                      type="tel"
                      required
                      pattern="[+0-9 ()-]{7,20}"
                      value={checkout.phone}
                      onChange={(e) =>
                        setCheckout({ ...checkout, phone: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Full name
                    <input
                      required
                      value={checkout.fullName}
                      onChange={(e) =>
                        setCheckout({ ...checkout, fullName: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Street address
                    <input
                      required
                      value={checkout.line1}
                      onChange={(e) =>
                        setCheckout({ ...checkout, line1: e.target.value })
                      }
                    />
                  </label>
                  <div>
                    <label>
                      City
                      <input
                        required
                        value={checkout.city}
                        onChange={(e) =>
                          setCheckout({ ...checkout, city: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Postal code
                      <input
                        required
                        value={checkout.postalCode}
                        onChange={(e) =>
                          setCheckout({
                            ...checkout,
                            postalCode: e.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Country
                    <input
                      required
                      value={checkout.country}
                      onChange={(e) =>
                        setCheckout({ ...checkout, country: e.target.value })
                      }
                    />
                  </label>
                  <button className="place-order" disabled={submitting}>
                    {submitting
                      ? "Placing order…"
                      : `Place order · ${money(subtotal)}`}
                  </button>
                </form>
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
