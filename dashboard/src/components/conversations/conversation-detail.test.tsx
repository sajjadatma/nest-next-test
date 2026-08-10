import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { ConversationDetail } from "./conversation-detail";
import { ConversationInboxItem } from "./conversation-types";
import { server } from "@/test/server";

const API_BASE = "http://127.0.0.1:5050/api";

const requestedItem: ConversationInboxItem = {
  handoffId: "handoff-1",
  conversationId: "conversation-1",
  reasonCode: "HANDOFF_REQUIRED",
  status: "REQUESTED",
  conversationStatus: "HANDOFF_REQUESTED",
  owner: "AI",
  requestedAt: "2026-08-10T10:00:00.000Z",
  acceptedById: null,
  resolvedAt: null,
  summary: {
    intent: "refund",
    products: [{ id: "product-1", name: "Running shoe" }],
    unresolvedIssue: { reasonCode: "HANDOFF_REQUIRED", agentNote: "Operator help required" },
  },
};

function renderDetail(overrides: Partial<React.ComponentProps<typeof ConversationDetail>> = {}) {
  const props = {
    item: requestedItem,
    permissions: ["conversations:read", "conversations:takeover"],
    pendingAction: false,
    canTakeover: true,
    onAccept: vi.fn(),
    onRelease: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<ConversationDetail {...props} />) };
}

describe("ConversationDetail", () => {
  it("AC-03: shows API-backed summary, verified products, and normalized message timeline", async () => {
    server.use(
      http.get(`${API_BASE}/conversations/conversation-1/messages`, () =>
        HttpResponse.json({
          conversationId: "conversation-1",
          messages: [
            { id: "message-1", direction: "INBOUND", type: "text", text: "I need a refund", intent: { intent: "refund", orderNumber: 42 }, occurredAt: "2026-08-10T09:00:00.000Z", createdAt: "2026-08-10T09:00:00.000Z" },
            { id: "message-2", direction: "OUTBOUND", type: "text", text: "I can help", intent: null, occurredAt: "2026-08-10T09:01:00.000Z", createdAt: "2026-08-10T09:01:00.000Z" },
          ],
        }),
      ),
    );

    renderDetail();

    expect(await screen.findByText("I need a refund")).toBeInTheDocument();
    expect(screen.getByText("I can help")).toBeInTheDocument();
    expect(screen.getByText("Running shoe")).toBeInTheDocument();
    expect(screen.getByText("intent: refund · orderNumber: 42")).toBeInTheDocument();
  });

  it("AC-04: calls takeover once and hides actions without the takeover permission", async () => {
    const user = userEvent.setup();
    server.use(http.get(`${API_BASE}/conversations/conversation-1/messages`, () => HttpResponse.json({ conversationId: "conversation-1", messages: [] })));
    const { props, rerender } = renderDetail();

    await user.click(await screen.findByRole("button", { name: "Take over this conversation" }));
    expect(props.onAccept).toHaveBeenCalledTimes(1);
    expect(props.onAccept).toHaveBeenCalledWith("conversation-1");

    rerender(<ConversationDetail {...props} canTakeover={false} permissions={["conversations:read"]} />);
    expect(screen.queryByRole("button", { name: "Take over this conversation" })).not.toBeInTheDocument();
    expect(screen.getByTestId("takeover-disabled-note")).toBeInTheDocument();
  });

  it("AC-05: exposes release-to-AI for a human-active conversation and prevents duplicate pending actions", async () => {
    const user = userEvent.setup();
    server.use(http.get(`${API_BASE}/conversations/conversation-1/messages`, () => HttpResponse.json({ conversationId: "conversation-1", messages: [] })));
    const activeItem = { ...requestedItem, status: "ACCEPTED" as const, conversationStatus: "HUMAN_ACTIVE" as const, owner: "HUMAN" as const };
    const { props } = renderDetail({ item: activeItem, pendingAction: true });

    const release = await screen.findByRole("button", { name: "Release this conversation back to AI" });
    expect(release).toBeDisabled();
    expect(release).toHaveTextContent("Releasing…");
    await user.click(release);
    expect(props.onRelease).not.toHaveBeenCalled();
  });

  it("AC-02: renders a recoverable history error", async () => {
    server.use(http.get(`${API_BASE}/conversations/conversation-1/messages`, () => HttpResponse.json({ message: "History unavailable" }, { status: 500 })));

    renderDetail();

    expect(await screen.findByRole("alert")).toHaveTextContent("History unavailable");
    await waitFor(() => expect(screen.getByText("No messages recorded for this conversation.")).toBeInTheDocument());
  });
});
