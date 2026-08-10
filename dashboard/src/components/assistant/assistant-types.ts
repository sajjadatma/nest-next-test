// Assistant chat client types — mirrors docs/contracts/messages.md (CommerceResponse union).
// The client renders ONLY what the API returns; it never computes prices or stock.

export type ProductCard = {
  productId: string;
  variantId: string;
  title: string;
  priceMinor: number;
  currency: string;
  availability: "in_stock" | "low_stock" | "out_of_stock";
  imageUrl?: string;
  productUrl: string;
  attributes: Record<string, string>;
};

export type ReplyOption = { id: string; label: string };

export type CommerceResponse =
  | { kind: "text"; text: string }
  | { kind: "product_carousel"; intro?: string; items: ProductCard[] }
  | { kind: "quick_replies"; text: string; options: ReplyOption[] }
  | { kind: "checkout_link"; text: string; url: string }
  | { kind: "human_handoff"; text: string };

export type SendMessageResponse = {
  conversationId: string;
  messageId: string;
  reply: CommerceResponse;
};

// A chat bubble as held in client state.
export type ClientChatMessage = {
  id: string; // messageId from server, or `user-<externalMessageId>` for user bubbles
  role: "user" | "assistant";
  text: string; // user text or text-kind reply / intro
  reply?: CommerceResponse; // structured assistant reply (absent for user bubbles)
  pending?: boolean; // optimistic user bubble before server confirms
  error?: boolean; // a failed send; retry will reuse externalMessageId
  externalMessageId?: string; // idempotency key for retries
};