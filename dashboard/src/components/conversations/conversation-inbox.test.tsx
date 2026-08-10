import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { ConversationInbox } from "./conversation-inbox";
import { server } from "@/test/server";
import { ShopAdminNavigation } from "@/components/shop-admin-navigation";

const API_BASE = "http://127.0.0.1:5050/api";

const handoffs = [
  {
    id: "handoff-requested",
    conversationId: "conversation-requested",
    reasonCode: "HANDOFF_REQUIRED",
    status: "REQUESTED",
    requestedAt: "2026-08-10T10:00:00.000Z",
    acceptedById: null,
    resolvedAt: null,
    summary: {
      intent: "refund",
      products: [{ id: "product-1", name: "Running shoe" }],
      unresolvedIssue: { reasonCode: "HANDOFF_REQUIRED", agentNote: "Operator help required" },
    },
  },
  {
    id: "handoff-resolved",
    conversationId: "conversation-ai",
    reasonCode: "HANDOFF_REQUIRED",
    status: "RESOLVED",
    requestedAt: "2026-08-10T09:00:00.000Z",
    acceptedById: "operator-1",
    resolvedAt: "2026-08-10T09:30:00.000Z",
    summary: {
      intent: "product_search",
      products: [],
      unresolvedIssue: { reasonCode: "HANDOFF_REQUIRED", agentNote: "Returned to AI" },
    },
  },
];

describe("ConversationInbox", () => {
  it("AC-07: exposes the conversations navigation entry only with conversations:read", () => {
    const { rerender } = render(<ShopAdminNavigation active="overview" permissions={["shop:manage"]} />);
    expect(screen.queryByRole("link", { name: /Conversations/i })).not.toBeInTheDocument();

    rerender(<ShopAdminNavigation active="overview" permissions={["conversations:read"]} />);
    expect(screen.getByRole("link", { name: /Conversations/i })).toHaveAttribute("href", "/dashboard/shop/conversations");
  });

  it("AC-01: lists handoffs with status and owner chips, then filters by handoff lifecycle", async () => {
    const user = userEvent.setup();
    let merchantHeader: string | null = null;
    server.use(
      http.get(`${API_BASE}/conversations/handoffs`, ({ request }) => {
        merchantHeader = request.headers.get("x-merchant-id");
        return HttpResponse.json(handoffs);
      }),
    );

    render(<ConversationInbox permissions={["conversations:read", "conversations:takeover"]} />);

    expect(await screen.findByText("refund")).toBeInTheDocument();
    expect(screen.getAllByText("Handoff requested")).not.toHaveLength(0);
    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(merchantHeader).toBe("default");

    await user.click(screen.getByRole("tab", { name: "AI active" }));
    expect(screen.getByText("product_search")).toBeInTheDocument();
    expect(screen.queryByText("refund")).not.toBeInTheDocument();
  });

  it("AC-02: shows an empty state and API error with a retry action", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    server.use(
      http.get(`${API_BASE}/conversations/handoffs`, () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ message: "Inbox unavailable" }, { status: 500 })
          : HttpResponse.json([]);
      }),
    );

    render(<ConversationInbox permissions={["conversations:read"]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Inbox unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("inbox-empty")).toBeInTheDocument());
    expect(attempts).toBe(2);
  });

  it("AC-02: renders a loading state before the handoff API resolves", () => {
    server.use(http.get(`${API_BASE}/conversations/handoffs`, async () => new Promise(() => undefined)));

    render(<ConversationInbox permissions={["conversations:read"]} />);

    expect(screen.getByRole("heading", { name: "Loading conversations…" })).toBeInTheDocument();
  });

  it("AC-04/06: rolls a requested handoff back after an accept error", async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API_BASE}/conversations/handoffs`, () => HttpResponse.json([handoffs[0]])),
      http.get(`${API_BASE}/conversations/conversation-requested/messages`, () => HttpResponse.json({ conversationId: "conversation-requested", messages: [] })),
      http.post(`${API_BASE}/conversations/conversation-requested/handoff/accept`, () => HttpResponse.json({ message: "Acceptance denied" }, { status: 403 })),
    );

    render(<ConversationInbox permissions={["conversations:read", "conversations:takeover"]} />);
    await user.click(await screen.findByRole("button", { name: "Open conversation conversation-requested" }));
    await user.click(await screen.findByRole("button", { name: "Take over this conversation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Acceptance denied");
    expect(screen.getByRole("button", { name: "Take over this conversation" })).toBeEnabled();
  });

  it("AC-04: accepts a requested handoff into the human-active lifecycle", async () => {
    const user = userEvent.setup();
    let accepted = false;
    server.use(
      http.get(`${API_BASE}/conversations/handoffs`, () => HttpResponse.json([{ ...handoffs[0], status: accepted ? "ACCEPTED" : "REQUESTED", acceptedById: accepted ? "operator-1" : null }])),
      http.get(`${API_BASE}/conversations/conversation-requested/messages`, () => HttpResponse.json({ conversationId: "conversation-requested", messages: [] })),
      http.post(`${API_BASE}/conversations/conversation-requested/handoff/accept`, () => {
        accepted = true;
        return HttpResponse.json({ ...handoffs[0], status: "ACCEPTED", acceptedById: "operator-1" });
      }),
    );

    render(<ConversationInbox permissions={["conversations:read", "conversations:takeover"]} />);
    await user.click(await screen.findByRole("button", { name: "Open conversation conversation-requested" }));
    await user.click(await screen.findByRole("button", { name: "Take over this conversation" }));
    await waitFor(() => expect(screen.getAllByText("Human active")).not.toHaveLength(0));
  });

  it("AC-05: releases a human-active handoff back to the AI lifecycle", async () => {
    const user = userEvent.setup();
    const activeHandoff = { ...handoffs[0], id: "handoff-active", conversationId: "conversation-active", status: "ACCEPTED", acceptedById: "operator-1" };
    let released = false;
    server.use(
      http.get(`${API_BASE}/conversations/handoffs`, () => HttpResponse.json([{ ...activeHandoff, status: released ? "RESOLVED" : "ACCEPTED" }])),
      http.get(`${API_BASE}/conversations/conversation-active/messages`, () => HttpResponse.json({ conversationId: "conversation-active", messages: [] })),
      http.post(`${API_BASE}/conversations/conversation-active/handoff/release`, () => {
        released = true;
        return HttpResponse.json({ ...activeHandoff, status: "RESOLVED" });
      }),
    );

    render(<ConversationInbox permissions={["conversations:read", "conversations:takeover"]} />);
    await user.click(await screen.findByRole("button", { name: "Open conversation conversation-active" }));
    await user.click(await screen.findByRole("button", { name: "Release this conversation back to AI" }));
    await waitFor(() => expect(screen.getAllByText("Active")).not.toHaveLength(0));
  });
});
