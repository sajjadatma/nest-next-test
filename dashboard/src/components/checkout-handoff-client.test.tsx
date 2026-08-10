import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { CheckoutHandoffClient } from "./checkout-handoff-client";
import { server } from "@/test/server";
import { useCartStore } from "@/stores/cart-store";

const API_BASE = "http://127.0.0.1:5050/api";

// CheckoutClient has its own network/effects lifecycle that is out of scope
// for the handoff wrapper contract (and is protected). Stub it so the tests
// focus on handoff verification, cart seeding, and recovery copy.
vi.mock("@/components/checkout-client", () => ({
  CheckoutClient: () => <div data-testid="checkout-client">Checkout</div>,
}));

// jsdom 29 under vitest does not provide a writable localStorage (the store
// is file-backed and `--localstorage-file` has no valid path), so the cart
// store's persist() throws "localStorage.setItem is not a function". Install
// a memory-backed localStorage before each test so seeding works.
const memory = new Map<string, string>();
const memoryLocalStorage: Storage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
  clear: () => memory.clear(),
  key: (i) => Array.from(memory.keys())[i] ?? null,
  get length() { return memory.size; },
};

const validResponse = {
  cartId: "cart-1",
  status: "HANDED_OFF",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  canCheckout: true,
  items: [
    {
      variantId: "var-1",
      productId: "prod-1",
      productName: "Canvas Tote",
      quantity: 2,
      unitPriceMinor: 2500,
      currency: "USD",
      availability: "IN_STOCK",
      variant: { id: "var-1", sku: "TOTE-1", productId: "prod-1", productName: "Canvas Tote" },
    },
  ],
};

function resetCart() {
  useCartStore.setState({ cart: [], ready: true, notice: "" });
}

describe("CheckoutHandoffClient", () => {
  beforeEach(() => {
    memory.clear();
    Object.defineProperty(window, "localStorage", {
      value: memoryLocalStorage,
      configurable: true,
      writable: true,
    });
    resetCart();
  });

  // AC-06 (loading)
  it("renders a loading state before the handoff resolves", async () => {
    server.use(
      http.get(`${API_BASE}/checkout/handoff/slow`, async () =>
        HttpResponse.json(validResponse, {}),
      ),
    );
    render(<CheckoutHandoffClient token="slow" />);
    expect(screen.getByText("Opening your checkout…")).toBeInTheDocument();
  });

  // AC-01
  it("AC-01: valid handoff seeds the cart with verified current items once and renders CheckoutClient", async () => {
    server.use(
      http.get(`${API_BASE}/checkout/handoff/valid-token`, () =>
        HttpResponse.json(validResponse),
      ),
    );
    render(<CheckoutHandoffClient token="valid-token" />);
    expect(await screen.findByTestId("checkout-client")).toBeInTheDocument();
    const cart = useCartStore.getState().cart;
    expect(cart).toHaveLength(1);
    expect(cart[0]).toMatchObject({
      id: "prod-1",
      name: "Canvas Tote",
      priceMinor: 2500,
      currency: "USD",
      quantity: 2,
    });
  });

  // AC-05
  it("AC-05: re-render does not duplicate cart lines (idempotent seeding)", async () => {
    server.use(
      http.get(`${API_BASE}/checkout/handoff/valid-token`, () =>
        HttpResponse.json(validResponse),
      ),
    );
    const { rerender } = render(<CheckoutHandoffClient token="valid-token" />);
    await screen.findByTestId("checkout-client");
    rerender(<CheckoutHandoffClient token="valid-token" />);
    await screen.findByTestId("checkout-client");
    const cart = useCartStore.getState().cart;
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
  });

  // AC-02
  it("AC-02: expired token shows expiry recovery copy and does not seed the cart", async () => {
    server.use(
      http.get(`${API_BASE}/checkout/handoff/expired-token`, () =>
        HttpResponse.json({ ...validResponse, canCheckout: false, reason: "EXPIRED" }),
      ),
    );
    render(<CheckoutHandoffClient token="expired-token" />);
    expect(
      await screen.findByRole("heading", {
        name: "This checkout link has expired.",
      }),
    ).toBeInTheDocument();
    expect(useCartStore.getState().cart).toHaveLength(0);
  });

  // AC-03
  it("AC-03: invalid/tampered token shows invalid-link recovery copy", async () => {
    server.use(
      http.get(`${API_BASE}/checkout/handoff/invalid-token`, () =>
        HttpResponse.json({ ...validResponse, canCheckout: false, reason: "INVALID" }),
      ),
    );
    render(<CheckoutHandoffClient token="invalid-token" />);
    expect(
      await screen.findByRole("heading", {
        name: "This checkout link is not valid.",
      }),
    ).toBeInTheDocument();
    expect(useCartStore.getState().cart).toHaveLength(0);
  });

  // AC-04 (out-of-stock)
  it("AC-04: out-of-stock shows the specific recovery copy and does not seed the cart", async () => {
    server.use(
      http.get(`${API_BASE}/checkout/handoff/oos-token`, () =>
        HttpResponse.json({
          ...validResponse,
          items: [{ ...validResponse.items[0], availability: "OUT_OF_STOCK" }],
          canCheckout: false,
          reason: "OUT_OF_STOCK",
        }),
      ),
    );
    render(<CheckoutHandoffClient token="oos-token" />);
    expect(
      await screen.findByRole("heading", {
        name: "An item in your bag is no longer available.",
      }),
    ).toBeInTheDocument();
    expect(useCartStore.getState().cart).toHaveLength(0);
  });

  // AC-04 (price-changed)
  it("AC-04: price-changed shows the specific recovery copy and does not seed the cart", async () => {
    server.use(
      http.get(`${API_BASE}/checkout/handoff/price-token`, () =>
        HttpResponse.json({
          ...validResponse,
          canCheckout: false,
          reason: "PRICE_CHANGED",
        }),
      ),
    );
    render(<CheckoutHandoffClient token="price-token" />);
    expect(
      await screen.findByRole("heading", {
        name: "Prices have changed since this link was issued.",
      }),
    ).toBeInTheDocument();
    expect(useCartStore.getState().cart).toHaveLength(0);
  });

  // EMPTY reason (canCheckout=false)
  it("EMPTY reason renders the empty-bag recovery copy and does not seed the cart", async () => {
    server.use(
      http.get(`${API_BASE}/checkout/handoff/empty-token`, () =>
        HttpResponse.json({
          ...validResponse,
          items: [],
          canCheckout: false,
          reason: "EMPTY",
        }),
      ),
    );
    render(<CheckoutHandoffClient token="empty-token" />);
    expect(
      await screen.findByRole("heading", { name: "Your bag is empty." }),
    ).toBeInTheDocument();
    expect(useCartStore.getState().cart).toHaveLength(0);
  });

  // AC-06 (error)
  it("AC-06: API error renders the error recovery screen", async () => {
    server.use(
      http.get(`${API_BASE}/checkout/handoff/boom`, () =>
        HttpResponse.json({ message: "Server error" }, { status: 500 }),
      ),
    );
    render(<CheckoutHandoffClient token="boom" />);
    expect(
      await screen.findByRole("heading", { name: "Something went wrong." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Server error")).toBeInTheDocument();
  });

  // AC-06 (Persian/RTL)
  it("AC-06: Persian browser renders RTL Persian recovery copy", async () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, "languages");
    Object.defineProperty(window.navigator, "languages", {
      value: ["fa-IR"],
      configurable: true,
    });
    try {
      server.use(
        http.get(`${API_BASE}/checkout/handoff/expired-token`, () =>
          HttpResponse.json({ ...validResponse, canCheckout: false, reason: "EXPIRED" }),
        ),
      );
      render(<CheckoutHandoffClient token="expired-token" />);
      expect(
        await screen.findByRole("heading", {
          name: "این لینک پرداخت منقضی شده است.",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("بازگشت به فروشگاه")).toBeInTheDocument();
      expect(screen.getByRole("main")).toHaveAttribute("dir", "rtl");
    } finally {
      if (original) {
        Object.defineProperty(window.navigator, "languages", original);
      }
    }
  });
});