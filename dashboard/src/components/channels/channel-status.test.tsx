import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ChannelStatus } from "./channel-status";
import { server } from "@/test/server";
import { ShopAdminNavigation } from "@/components/shop-admin-navigation";

const API_BASE = "http://127.0.0.1:5050/api";

const channels = [
  {
    id: "telegram",
    label: "Telegram",
    configured: true,
    healthy: true,
    lastEventAt: "2026-08-10T12:30:00.000Z",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    configured: false,
    healthy: false,
    error: "Channel is not configured",
  },
];

describe("ChannelStatus", () => {
  it("AC-04: exposes Channels navigation only with channels:read, not shop:manage", () => {
    const { rerender } = render(<ShopAdminNavigation active="overview" permissions={["shop:manage"]} />);
    expect(screen.queryByRole("link", { name: /Channels/i })).not.toBeInTheDocument();

    rerender(<ShopAdminNavigation active="channels" permissions={["channels:read"]} />);
    expect(screen.getByRole("link", { name: /Channels/i })).toHaveAttribute("href", "/dashboard/shop/channels");
  });

  it("AC-01/02: renders only safe channel status fields with configured, healthy, and error states", async () => {
    let merchantHeader: string | null = null;
    server.use(http.get(`${API_BASE}/channels/status`, ({ request }) => {
      merchantHeader = request.headers.get("x-merchant-id");
      return HttpResponse.json(channels);
    }));

    const { container } = render(<ChannelStatus permissions={["channels:read"]} />);

    expect(await screen.findByRole("heading", { name: "Telegram" })).toBeInTheDocument();
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Channel is not configured")).toBeInTheDocument();
    expect(screen.getByText(/Last event:/)).toBeInTheDocument();
    expect(merchantHeader).toBe("default");
    expect(container.textContent).not.toMatch(/credential|token|password|secret/i);
  });

  it("AC-03: renders loading before an empty channel response", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    server.use(http.get(`${API_BASE}/channels/status`, () => new Promise((resolve) => { resolveResponse = resolve; })));

    render(<ChannelStatus permissions={["channels:read"]} />);
    expect(screen.getByRole("heading", { name: "Loading channels…" })).toBeInTheDocument();

    await waitFor(() => expect(resolveResponse).toBeTypeOf("function"));
    resolveResponse?.(HttpResponse.json([]));
    expect(await screen.findByTestId("channels-empty")).toHaveTextContent("No channels are available");
  });

  it("AC-03: shows an API error and retries the status request", async () => {
    let attempts = 0;
    server.use(http.get(`${API_BASE}/channels/status`, () => {
      attempts += 1;
      return attempts === 1
        ? HttpResponse.json({ message: "Channel status unavailable" }, { status: 500 })
        : HttpResponse.json(channels);
    }));

    const user = userEvent.setup();
    render(<ChannelStatus permissions={["channels:read"]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Channel status unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Telegram" })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });
});
