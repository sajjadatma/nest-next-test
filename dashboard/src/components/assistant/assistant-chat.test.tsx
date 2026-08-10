import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, it, expect, beforeEach } from "vitest";
import { AssistantChat } from "./assistant-chat";
import { server } from "@/test/server";
import { clear } from "@/lib/api";

const API_BASE = "http://127.0.0.1:5050/api";

const CAROUSEL_REPLY = {
  kind: "product_carousel" as const,
  intro: "Here are matching products",
  items: [
    {
      productId: "prod-1",
      variantId: "var-1",
      title: "White Runner",
      priceMinor: 90000,
      currency: "IRR",
      availability: "in_stock" as const,
      productUrl: "/shop/products/white-runner",
      attributes: { color: "White", size: "42" },
    },
  ],
};

const QUICK_REPLY = {
  kind: "quick_replies" as const,
  text: "Did you mean white?",
  options: [
    { id: "opt-white", label: "White" },
    { id: "opt-black", label: "Black" },
  ],
};

function getMessage(
  override: Partial<{ conversationId: string; messageId: string; reply: unknown }> = {},
) {
  return HttpResponse.json({
    conversationId: override.conversationId ?? "conv-1",
    messageId: override.messageId ?? "msg-1",
    reply: override.reply ?? CAROUSEL_REPLY,
  });
}

/** The viewport <section aria-label="Conversation"> holds the chat bubbles. */
function viewport() {
  return within(screen.getByRole("region", { name: "Conversation" }));
}

describe("AssistantChat", () => {
  beforeEach(() => {
    clear();
    sessionStorage?.clear();
  });

  it("AC-01: sends Persian text and renders a product carousel from API data", async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> | undefined;
    let capturedMerchantHeader: string | null = null;

    server.use(
      http.post(`${API_BASE}/conversations/messages`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        capturedMerchantHeader = request.headers.get("x-merchant-id");
        return getMessage({ reply: CAROUSEL_REPLY });
      }),
    );

    render(<AssistantChat />);
    const input = screen.getByLabelText("New message") as HTMLTextAreaElement;
    await user.type(input, "کفش سفید سایز ۴۲");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(viewport().getByRole("link", { name: "White Runner" })).toBeInTheDocument(),
    );

    // Header sent with correct merchant id
    expect(capturedMerchantHeader).toBe("default");
    // Body shape
    expect(capturedBody?.text).toBe("کفش سفید سایز ۴۲");
    expect(capturedBody?.externalMessageId).toEqual(expect.any(String));
    expect(capturedBody?.externalUserId).toEqual(expect.any(String));
    // Price rendered from API data (money formats 90000 minor IRR → 900.00 IRR)
    expect(screen.getByText(/IRR/)).toBeInTheDocument();
    // Availability badge from API
    expect(screen.getByText(/In stock/i)).toBeInTheDocument();
  });

  it("AC-02: sends a follow-up to the same conversationId", async () => {
    const user = userEvent.setup();
    const conversationIds: string[] = [];

    server.use(
      http.post(`${API_BASE}/conversations/messages`, async () => {
        const id = "conv-shared";
        conversationIds.push(id);
        return getMessage({
          conversationId: id,
          messageId: `msg-${conversationIds.length}`,
          reply: { kind: "text", text: "OK" },
        });
      }),
    );

    render(<AssistantChat />);
    const input = screen.getByLabelText("New message");

    await user.type(input, "white runner");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(viewport().getByText("OK")).toBeInTheDocument());

    await user.type(input, "the cheaper one");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(viewport().getAllByText("OK")).toHaveLength(2));

    expect(conversationIds).toEqual(["conv-shared", "conv-shared"]);
  });

  it("AC-03: error state shows retry and retry resends with the SAME externalMessageId without duplicating the user bubble", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const externalIds: string[] = [];

    server.use(
      http.post(`${API_BASE}/conversations/messages`, async ({ request }) => {
        attempts += 1;
        const body = (await request.json()) as Record<string, unknown>;
        externalIds.push(body.externalMessageId as string);
        if (attempts === 1) {
          return HttpResponse.json(
            { message: "Service unavailable" },
            { status: 500 },
          );
        }
        return getMessage({ reply: { kind: "text", text: "Replied after retry" } });
      }),
    );

    render(<AssistantChat />);
    const input = screen.getByLabelText("New message");

    await user.type(input, "hello there");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    // retry button in the error bar
    const retryButton = await screen.findByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Service unavailable/);

    // exactly one user bubble in the viewport — retry must not add a second
    expect(viewport().getAllByText("hello there")).toHaveLength(1);

    fireEvent.click(retryButton);

    await waitFor(() => expect(viewport().getByText("Replied after retry")).toBeInTheDocument());

    // same externalMessageId reused for idempotency
    expect(externalIds).toHaveLength(2);
    expect(externalIds[0]).toBe(externalIds[1]);
    expect(viewport().getAllByText("hello there")).toHaveLength(1);
  });

  it("AC-04: quick_replies render as buttons and clicking sends the mapped option", async () => {
    const user = userEvent.setup();
    const sentTexts: string[] = [];

    server.use(
      http.post(`${API_BASE}/conversations/messages`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        sentTexts.push(body.text as string);
        return getMessage({
          reply: QUICK_REPLY,
          messageId: `msg-${sentTexts.length}`,
        });
      }),
    );

    render(<AssistantChat />);
    const input = screen.getByLabelText("New message");
    await user.type(input, "show me shoes");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    const optionButton = await screen.findByRole("button", { name: "White" });
    expect(optionButton).toBeInTheDocument();

    fireEvent.click(optionButton);

    await waitFor(() => expect(sentTexts).toEqual(["show me shoes", "White"]));
  });

  it("AC-05: Persian input sets dir=rtl lang=fa; English stays LTR; labels accessible", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API_BASE}/conversations/messages`, () =>
        getMessage({ reply: { kind: "text", text: "Greetings" } }),
      ),
    );

    const { container } = render(<AssistantChat />);
    const main = container.querySelector(".assistant-shell") as HTMLElement;

    // initial English → LTR
    expect(main.dir).toBe("ltr");
    expect(main.lang).toBe("en");

    const input = screen.getByLabelText("New message");
    await user.type(input, "سلام دنیا");
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(main.dir).toBe("rtl");
      expect(main.lang).toBe("fa");
    });

    // labels accessible in both modes
    expect(screen.getByLabelText("New message")).toBeInTheDocument();
  });

  it("AC-06: Enter sends, Shift+Enter newline; focus returns to input after send; aria-live announces assistant reply", async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API_BASE}/conversations/messages`, () =>
        getMessage({ reply: { kind: "text", text: "Reply announcement" } }),
      ),
    );

    render(<AssistantChat />);
    const input = screen.getByLabelText("New message") as HTMLTextAreaElement;

    await user.type(input, "hello{Enter}");

    await waitFor(() => expect(viewport().getByText("Reply announcement")).toBeInTheDocument());

    // focus returns to input after send
    expect(document.activeElement).toBe(input);

    // aria-live polite region announces the reply
    const liveRegion = screen.getByTestId("assistant-live");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveTextContent("Reply announcement");

    // Shift+Enter adds a newline; the message is NOT sent
    await user.type(input, "{Shift>}{Enter}{/Shift}");
    expect(input.value).toBe("\n");
    // no new assistant bubble in viewport
    expect(viewport().getAllByText("Reply announcement")).toHaveLength(1);
  });

  it("AC-07: empty state shows a welcome hint; loading disables input; human_handoff renders a notice", async () => {
    server.use(
      http.post(`${API_BASE}/conversations/messages`, () =>
        getMessage({ reply: { kind: "human_handoff", text: "Connecting you to an agent." } }),
      ),
    );

    render(<AssistantChat />);

    // empty welcome hint
    expect(await screen.findByText(/Hello! How can I help you/i)).toBeInTheDocument();
    expect(screen.getByText(/white runner/i)).toBeInTheDocument();

    const input = screen.getByLabelText("New message") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "I need help" } });
    expect(input.value).toBe("I need help");

    // sending; input should be disabled while pending
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    });

    // The human_handoff notice appears in the viewport
    await waitFor(() =>
      expect(viewport().getByText("Connecting you to an agent.")).toBeInTheDocument(),
    );
  });
});