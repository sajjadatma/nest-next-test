# Contracts — Demand Events (v1)

**Frozen by:** ORC (Sol Medium), 2026-08-10 — see ADR-004.

## Purpose

Capture what the customer wanted and what happened, especially unmet demand, without storing identity or raw text in shared analytics.

## Outcomes (state machine)

```text
UNKNOWN
  → MATCHED | NO_MATCH | OUT_OF_STOCK | PRICE_TOO_HIGH | VARIANT_UNAVAILABLE | HANDED_OFF
MATCHED
  → MATCHED_NOT_PURCHASED | PURCHASED | ABANDONED | HANDED_OFF
```

- One qualified request → one demand record (upsert by `(merchantId, conversationId, intentKey)`).
- Purchase attribution window: undefined until Product decides; until then no recovered-demand metric.
- `privacyVersion` records the policy version applied.

## Schema

```ts
type DemandEvent = {
  id: string;                    // internal
  merchantId: string;
  occurredAt: string;            // UTC ISO
  channel: 'instagram' | 'whatsapp' | 'telegram' | 'web';
  region?: string;               // only when merchant-approved and thresholded
  category?: string;             // canonical category slug
  brand?: string;
  canonicalAttributes: Record<string, string | number | boolean>; // controlled vocabulary
  size?: string;
  budgetMin?: number; budgetMax?: number;
  currency?: string;
  purchaseIntent?: 'low' | 'medium' | 'high' | 'unknown';
  confidence?: number;           // internal only
  matchedProductId?: string;     // product id, never customer data
  outcome: DemandOutcome;
  failureReason?: string;        // deterministic code, e.g. OUT_OF_STOCK
  privacyVersion: string;
};
```

## Privacy invariants

- No customer id, external user id, phone, email, handle, or raw message text in DemandEvent or aggregates.
- Minimum aggregation threshold (default 5) before any attribute/region cell is displayed; below threshold → suppressed.
- Raw provider payloads not persisted; retention config-driven (human/legal decision before production).
- Merchant isolation: every query is scoped by merchantId; cross-merchant aggregation is rejected.

## Aggregation views (MVP1, deterministic SQL)

- request volume by category + period;
- top requested attributes;
- matched vs unmet demand;
- out-of-stock demand (OUT_OF_STOCK | VARIANT_UNAVAILABLE);
- price-too-high demand (PRICE_TOO_HIGH);
- top requested variants/sizes/colors;
- trend direction only when sample size sufficient (threshold-based);
- estimated opportunity = verified counts × verified price band, formula documented and auditable — never presented as revenue.

## Test requirements

Outcome transition matrix; idempotent replay (no duplicates); merchant isolation; small-cell suppression; no PII in shared output; deletion/retention behavior.
