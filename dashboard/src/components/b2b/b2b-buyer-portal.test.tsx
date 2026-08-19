import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { save } from "@/lib/api";
import { server } from "@/test/server";
import type { B2bCart } from "@/components/b2b/types";
import { B2bBuyerPortal } from "./b2b-buyer-portal";

const company = { id: "company-1", name: "Acme Industries", slug: "acme-industries", status: "ACTIVE", customerGroupId: "group-1", customerGroup: { id: "group-1", name: "Wholesale", code: "WHOLESALE", currency: "USD", isActive: true }, membership: { id: "membership-1", role: "BUYER", status: "ACTIVE" } };
const item = { variantId: "variant-1", sku: "ACME-RED", name: "Red variant", product: { id: "product-1", name: "Canvas Tote", slug: "canvas-tote", category: { name: "Bags" } }, currency: "USD", unitPriceMinor: 1200, quantity: 2, subtotalMinor: 2400, source: "price_list", minimumOrderQty: 1, packSize: 1, quantityIncrement: 1, stockQty: 20 } as const;
const emptyCart: B2bCart = { id: null, companyId: "company-1", currency: "USD", lines: [], itemCount: 0, subtotalMinor: 0, hasInvalidLines: false, updatedAt: null };
const filledCart = { ...emptyCart, id: "cart-1", lines: [{ lineId: "line-1", ...item, valid: true, validationError: null }], itemCount: 2, subtotalMinor: 2400 };

describe("B2bBuyerPortal cart", () => {
  beforeEach(() => {
    save({ accessToken: "token-1", user: { id: "user-1", email: "buyer@example.com", name: "Buyer" } });
  });

  function installHandlers(currentCompany = company, cart = emptyCart) {
    server.use(
      http.get("http://127.0.0.1:5050/api/b2b/companies", () => HttpResponse.json([currentCompany])),
      http.get("http://127.0.0.1:5050/api/b2b/companies/company-1/catalog", () => HttpResponse.json({ items: [item], total: 1, page: 1, pageSize: 48, pages: 1, companyId: "company-1", customerGroupId: "group-1" })),
      http.get("http://127.0.0.1:5050/api/b2b/companies/company-1/cart", () => HttpResponse.json(cart)),
    );
  }

  it("loads the persisted cart and refreshes it after adding a catalogue item", async () => {
    installHandlers();
    server.use(http.post("http://127.0.0.1:5050/api/b2b/companies/company-1/cart/lines", () => HttpResponse.json(filledCart)));
    render(<B2bBuyerPortal />);

    expect(await screen.findByRole("heading", { name: "Your business cart" })).toBeInTheDocument();
    expect(await screen.findByText("Your business cart is empty.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to business cart" }));

    expect(await screen.findByText("Item added to your business cart.")).toBeInTheDocument();
    expect(screen.getAllByText("ACME-RED", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText("Company price")).toBeInTheDocument();
    expect(screen.getAllByText("$24.00").length).toBeGreaterThan(0);
  });

  it("keeps cart mutations disabled for viewer members", async () => {
    installHandlers({ ...company, membership: { ...company.membership, role: "VIEWER" } }, filledCart);
    render(<B2bBuyerPortal />);

    expect(await screen.findByRole("button", { name: "View only" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear cart" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "Quantity Red variant" })).toBeDisabled();
  });

  it("updates and removes a persisted line", async () => {
    installHandlers(company, filledCart);
    server.use(
      http.patch("http://127.0.0.1:5050/api/b2b/companies/company-1/cart/lines/variant-1", () => HttpResponse.json({ ...filledCart, lines: [{ ...filledCart.lines[0], quantity: 4, subtotalMinor: 4800 }], itemCount: 4, subtotalMinor: 4800 })),
      http.delete("http://127.0.0.1:5050/api/b2b/companies/company-1/cart/lines/variant-1", () => HttpResponse.json(emptyCart)),
    );
    render(<B2bBuyerPortal />);

    const quantity = await screen.findByRole("spinbutton", { name: "Quantity Red variant" });
    fireEvent.change(quantity, { target: { value: "4" } });
    expect(await screen.findByText("Business cart updated.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Quantity Red variant" })).toHaveValue(4);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("Item removed from your business cart.")).toBeInTheDocument();
    expect(screen.getByText("Your business cart is empty.")).toBeInTheDocument();
  });
});
