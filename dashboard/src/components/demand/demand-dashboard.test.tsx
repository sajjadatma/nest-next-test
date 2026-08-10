import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { DemandDashboard } from "./demand-dashboard";
import { server } from "@/test/server";
import { ShopAdminNavigation } from "@/components/shop-admin-navigation";

const API_BASE = "http://127.0.0.1:5050/api";

const summary = {
  range: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-10T23:59:59.999Z" },
  volume: 10,
  volumeByCategory: [{ category: "shoes", count: 6 }, { category: "bags", count: 4 }],
  matched: 6,
  unmet: 4,
  outOfStock: 3,
  priceTooHigh: 1,
  topAttributes: [{ attribute: "color", value: "white", count: 5 }],
  topSizes: [{ value: "42", count: 5 }],
  topColors: [{ value: "white", count: 5 }],
  trend: "up" as const,
};

describe("DemandDashboard", () => {
  it("AC-05: exposes the Demand navigation entry only with demand:read", () => {
    const { rerender } = render(<ShopAdminNavigation active="overview" permissions={["shop:manage"]} />);
    expect(screen.queryByRole("link", { name: /Demand/i })).not.toBeInTheDocument();

    rerender(<ShopAdminNavigation active="overview" permissions={["demand:read"]} />);
    expect(screen.getByRole("link", { name: /Demand/i })).toHaveAttribute("href", "/dashboard/shop/demand");
  });

  it("AC-01/03: renders API aggregate cards including server volume, category data, qualified details, and trend", async () => {
    let merchantHeader: string | null = null;
    server.use(http.get(`${API_BASE}/demand/summary`, ({ request }) => {
      merchantHeader = request.headers.get("x-merchant-id");
      return HttpResponse.json(summary);
    }));

    render(<DemandDashboard permissions={["demand:read"]} />);

    expect(await screen.findByTestId("demand-volume")).toHaveTextContent("10");
    expect(screen.getAllByText("Matched")).not.toHaveLength(0);
    expect(screen.getAllByText("6")).not.toHaveLength(0);
    expect(screen.getByText("shoes")).toBeInTheDocument();
    expect(screen.getByTestId("top-attributes")).toHaveTextContent("color: white (5)");
    expect(screen.getByTestId("top-sizes")).toHaveTextContent("42 (5)");
    expect(screen.getByTestId("top-colors")).toHaveTextContent("white (5)");
    expect(screen.getByTestId("demand-trend")).toHaveTextContent("Trend: Increasing");
    expect(merchantHeader).toBe("default");
  });

  it("AC-02: changes outcome and custom dates through a server refetch with correct query params", async () => {
    const requests: string[] = [];
    server.use(http.get(`${API_BASE}/demand/summary`, ({ request }) => {
      requests.push(request.url);
      return HttpResponse.json(summary);
    }));
    const user = userEvent.setup();
    render(<DemandDashboard permissions={["demand:read"]} />);
    await screen.findByTestId("demand-volume");

    await user.click(screen.getByRole("button", { name: "Out of stock" }));
    await waitFor(() => expect(requests.at(-1)).toContain("outcome=out-of-stock"));

    await user.clear(screen.getByLabelText("Demand range from"));
    await user.type(screen.getByLabelText("Demand range from"), "2026-08-01");
    await waitFor(() => expect(requests.at(-1)).toContain("from=2026-08-01T00%3A00%3A00.000Z"));
  });

  it("AC-03: renders suppressed lists as absent rather than zero and omits an unavailable trend", async () => {
    server.use(http.get(`${API_BASE}/demand/summary`, () => HttpResponse.json({
      ...summary,
      topAttributes: [],
      topSizes: [],
      topColors: [],
      trend: null,
    })));

    render(<DemandDashboard permissions={["demand:read"]} />);
    expect(await screen.findByTestId("top-attributes")).toHaveTextContent("—");
    expect(screen.getByTestId("top-sizes")).toHaveTextContent("—");
    expect(screen.getByTestId("top-colors")).toHaveTextContent("—");
    expect(screen.queryByTestId("demand-trend")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("AC-04: shows initial loading, then an empty state for zero API volume", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    server.use(http.get(`${API_BASE}/demand/summary`, () => new Promise((resolve) => { resolveResponse = resolve; })));
    render(<DemandDashboard permissions={["demand:read"]} />);
    expect(screen.getByRole("heading", { name: "Loading demand dashboard…" })).toBeInTheDocument();

    await waitFor(() => expect(resolveResponse).toBeTypeOf("function"));
    resolveResponse?.(HttpResponse.json({ ...summary, volume: 0, volumeByCategory: [], matched: 0, unmet: 0, outOfStock: 0, priceTooHigh: 0, trend: null }));
    expect(await screen.findByTestId("demand-empty")).toBeInTheDocument();
  });

  it("AC-04: shows an API error and retries", async () => {
    let attempts = 0;
    server.use(http.get(`${API_BASE}/demand/summary`, () => {
      attempts += 1;
      return attempts === 1
        ? HttpResponse.json({ message: "Demand unavailable" }, { status: 500 })
        : HttpResponse.json(summary);
    }));
    const user = userEvent.setup();
    render(<DemandDashboard permissions={["demand:read"]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Demand unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("demand-volume")).toHaveTextContent("10");
    expect(attempts).toBe(2);
  });
});
