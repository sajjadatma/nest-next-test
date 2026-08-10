# Contracts — Messages (v1)

**Frozen by:** ORC (Sol Medium), 2026-08-10 — see ADR-002.
**Applies to:** all channel adapters, orchestrator, web harness, tests.

## Inbound (canonical)

```ts
type NormalizedInboundMessage = {
  id: string;                       // internal unique id (cuid)
  merchantId: string;
  channel: 'instagram' | 'whatsapp' | 'telegram' | 'web';
  externalMessageId: string;        // provider-scoped id; idempotency key source
  externalUserId: string;
  customerId?: string;
  conversationId?: string;
  type: 'text' | 'image' | 'audio' | 'file' | 'button' | 'postback';
  text?: string;
  mediaUrl?: string;
  payload?: Record<string, unknown>; // redacted/normalized metadata only; raw provider payload NOT persisted
  occurredAt: string;               // ISO-8601 UTC
};
```

Rules:
1. Webhook verification must pass before normalization.
2. `(merchantId, channel, externalMessageId)` unique → replay creates nothing new.
3. Raw provider payloads are not persisted; a redacted `payload` subset is allowed under retention policy.
4. Channel failures are observable (SystemLog/audit) and retryable.
5. Normalized messages must be replayable in dev/test without side effects.

## Outbound (internal first, channel formatter second)

```ts
type ProductCard = {
  productId: string; variantId: string; title: string; priceMinor: number; currency: string;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock'; imageUrl?: string; productUrl: string;
  attributes: Record<string, string>; // canonical attributes incl. color/size when present
};

type CommerceResponse =
  | { kind: 'text'; text: string }
  | { kind: 'product_carousel'; intro?: string; items: ProductCard[] }
  | { kind: 'quick_replies'; text: string; options: ReplyOption[] }   // ReplyOption = { id, label }
  | { kind: 'checkout_link'; text: string; url: string }
  | { kind: 'human_handoff'; text: string };
```

Rules:
- Channels render only supported primitives (Telegram: text/buttons/links; Web: full rendering).
- Complex checkout/payment flows open the secure web surface; never inline-format provider-specific UI assumptions.

## Structured intent (validated, partial allowed)

```ts
type StructuredIntent = {
  intent: 'product_search' | 'refine_search' | 'compare' | 'select_variant' | 'add_to_cart' | 'checkout' | 'handoff' | 'other';
  category?: string;                    // canonical category slug
  attributes?: Record<string, string>;  // controlled vocabulary, e.g. color, use_case, material
  size?: string;
  budgetMin?: number; budgetMax?: number; currency?: string;
  referenceProductIds?: string[];       // positional/context references resolved by orchestrator
  purchaseIntent?: 'low' | 'medium' | 'high' | 'unknown';
  confidence: number;                   // 0..1, internal only
  missingInformation: string[];         // empty when search is possible
};
```

Rules: ask a clarifying question only when it materially improves the result or is required for an action; never ask for data already supplied.
