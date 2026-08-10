# PRODUCT.md — AI Commerce Agent + Demand Signal Foundation (MVP1)

**Spec:** PRODUCT-CONTRACT v1
**Status:** Approved by human (2026-08-10) — `APPROVE PLAN v0.1 + use existing shop database`
**Repository:** /Users/sajad/Documents/Tasks/Projects/nest (branch `shop_v1`)
**Product Authority:** Product Agent (Sol Medium)

## 1. Core promise

A customer can shop conversationally in Persian or English while every commercial fact comes from the merchant backend, and the merchant learns which demand was fulfilled or lost without exposing customer identity in shared analytics.

## 2. Primary users

| User | Job |
|---|---|
| Customer | Discovers, compares, selects, and starts checkout inside conversation (Web chat, later Telegram). |
| Merchant operator | Reviews conversations, takes over when needed, sees demand summaries. |
| Administrator | Manages merchant membership, permissions, channels, credentials, policies, audit records. |

## 3. Primary journey

```
Natural-language request → verified product options → contextual follow-up
→ selected variant → cart/checkout handoff → outcome → demand event
```

## 4. Product DNA

- The AI agent is the shopping interface; the merchant backend is the source of truth; conversation outcomes are market signals.
- Tool-first and evidence-first: the model states only facts returned by approved tools or approved policy.
- Never invent: SKU, price, stock, size availability, shipping promise, discount, or return policy.
- Fail closed: when inventory, price, policy, or channel delivery cannot be verified, communicate uncertainty or hand off to a human — never invent a result or claim an order.
- Shared demand analytics contain aggregated, privacy-safe attributes only — never customer identity or raw conversation text.
- Persian/RTL support from day one; English fallback remains.

## 5. MVP1 outcomes (must)

1. Natural-language product request → accurate recommendations from the real catalog.
2. Image, title, attributes, current price, availability shown from verified data.
3. Follow-ups: "cheaper", "white", "size 42", "compare second and third" resolve against conversation state.
4. Select product/variant → cart or signed checkout handoff into the existing web checkout.
5. Human transfer with a useful operator summary when required.
6. Same normalized conversation model across Web and external channels.
7. Structured demand record: what was wanted, whether it matched, what happened.
8. Merchant operational view: conversations + status, AI/human ownership, top requests, unmatched/out-of-stock demand, category/attribute/budget-band views, conversion and lost-demand outcomes.

## 6. Scope — build now

1. Merchant + membership scope with cross-merchant isolation (default-merchant backfill for existing data).
2. ProductVariant with SKU, canonical attributes, color/size, per-variant price/currency/stock.
3. Approved commerce tools: search_products, get_product, check_inventory, get_price, get_product_images, compare_products, get_shipping_estimate, get_customer_context, create_cart, add_to_cart, create_checkout_link, handoff_to_human, record_demand_outcome.
4. Persistent normalized conversations/messages with replay-safe idempotency.
5. Deterministic Web chat harness (same orchestrator as external channels).
6. One external launch channel: Telegram (Webhook adapter).
7. Contextual follow-ups: positional references, cheaper, color/size refinement, comparison.
8. Persistent server-side cart + expiring signed checkout handoff into existing checkout/order flow.
9. Human conversation inbox, takeover, return-to-AI, operator summary.
10. Privacy-safe DemandEvent pipeline + deterministic SQL aggregates.
11. Dashboard sections: Channels, Conversations, Demand.
12. Persian/RTL customer chat + dashboard readiness.
13. Security, observability, retry/idempotency, deterministic LLM evaluation set, and exact-revision release evidence.

## 7. Simplify

- Web + Telegram only; Instagram/WhatsApp remain contract-tested adapter interfaces, not production integrations.
- PostgreSQL structured filters/full-text; no vector database.
- Modular monolith, synchronous operations; no Redis/BullMQ until measured evidence requires it.
- Reuse existing checkout (COD order path); no new payment provider.
- Demand views are counts + verified price bands; no predictive AI, no unaudited opportunity claims.

## 8. Defer

Instagram/WhatsApp adapters; cross-store routing/referral/payout/settlement; autonomous discounting/purchasing/outbound campaigns; CRM replacement; visual recognition; warehouse/streaming; predictive demand AI.

## 9. Reject for MVP1

Model-generated commerce facts; arbitrary SQL/HTTP/shell/payment tools exposed to the model; web-only conversation logic bypassing normalized contracts; shared demand reports with raw text or identity; parallel work before contracts lock.

## 10. Business rules (behavior contract)

### Search and recommend
- Search executes when enough information exists; clarify only when it materially improves the result or is required for an action.
- No exact match → state so, record the reason, offer only verified alternatives when they exist.
- Distinguish: not found / out of stock / price too high / uncertain.
- Never expose internal confidence scores to customers unless approved policy says otherwise.
- Recommendation reasons come from catalog attributes only.

### Context references
- "the second one", "the cheaper one", "compare these two" resolve against stored product/variant IDs from the current conversation state — never fuzzy text alone.

### Cart and checkout
- Cart is merchant/customer/conversation-scoped; items reference verified variants.
- Checkout handoff is signed, expiring, tamper-resistant; price/stock revalidated at order creation.
- Order creation reuses existing atomic stock reservation + idempotency keys; no overselling.

### Human handoff
- Trigger on: refunds, complaints, payment problems, angry customers, policy exceptions, low confidence, requests outside allowed scope.
- On handoff: stop autonomous commerce mutation, create handoff record, provide operator summary (customer intent, verified products, unresolved issue).
- States: AI_ACTIVE → HANDOFF_REQUESTED → HUMAN_ACTIVE → AI_ACTIVE; any state → CLOSED.

### Demand outcomes
- UNKNOWN → MATCHED | NO_MATCH | OUT_OF_STOCK | PRICE_TOO_HIGH | VARIANT_UNAVAILABLE | HANDED_OFF
- MATCHED → MATCHED_NOT_PURCHASED | PURCHASED | ABANDONED | HANDED_OFF
- Later purchase attribution window: must be defined by Product before any "recovered demand" metric is claimed. Until then: no recovered-demand claims.

### Identity
- Customer profiles unify internally, but linking is conservative: no merge based on similar names; verified or merchant-approved linking only.
- Shared demand layer never exposes customer IDs, phone, email, handles, or raw message content.

### Retention
- Raw provider payloads are NOT persisted by default (normalized data + redacted metadata only).
- Conversation/retention periods are configuration-driven; production release requires a human/legal retention decision (BLOCKER for production, not local implementation).

## 11. Terminology (canonical)

| Term | Meaning |
|---|---|
| Merchant | Tenant owning catalog, conversations, carts, demand records. |
| Conversation | Channel-agnostic thread owned by one merchant. |
| Message | Normalized inbound/outbound unit with external IDs for idempotency. |
| Variant | Sellable unit (SKU, color/size, price, stock). |
| Handoff | Signed, expiring checkout continuation into web checkout. |
| DemandEvent | Privacy-safe structured outcome record. |
| Outcome | Terminal demand classification (Section 10). |

## 12. Success metrics / guardrails

- Outcome: search success, add-to-cart, checkout-start, purchase conversion (auditable attribution only).
- Guardrail: zero invented price/stock/shipping facts in deterministic evaluation; zero cross-merchant access; zero duplicate message/cart/order/demand under replay; 100% handoff scenarios stop mutation; no secrets/identity in shared output.
- Technical: webhook accept/fail/duplicate rate, E2E latency, tool/model latency + errors, outbound failure/retry, handoff rate.
- No revenue claim from conversation volume alone.

## 13. Acceptance criteria (Product gates)

- **AC-01 Catalog truth:** every displayed title/image/price/currency/variant/availability matches backend data at tool-call time.
- **AC-02 NL search:** Persian or English request with category/color/size/use-case/budget searches without a rigid form.
- **AC-03 Follow-up context:** positional/attribute references resolve against conversation state + product IDs.
- **AC-04 No match:** clearly stated, reason recorded, verified alternatives only.
- **AC-05 Out of stock:** distinguishes unavailable inventory from absent catalog; records OUT_OF_STOCK / VARIANT_UNAVAILABLE.
- **AC-06 Cart/checkout:** valid variant → cart/signed link with correct merchant, product, variant, quantity, current price.
- **AC-07 Human handoff:** condition triggers stop of autonomous action, handoff record, concise operator summary.
- **AC-08 Channel normalization:** same commerce logic through web harness + one external channel, same contracts.
- **AC-09 Idempotency:** replaying the same webhook duplicates nothing (messages, carts, orders, demand events, replies).
- **AC-10 Demand event:** qualified request → structured demand event (category/attributes, budget, intent, confidence, outcome, time, merchant scope, no unnecessary identity).
- **AC-11 Demand dashboard:** merchant filters/views volume, matched/unmet, out-of-stock, price-too-high, top attributes for a period.
- **AC-12 Authorization:** a merchant/operator cannot read or mutate another merchant's data at any boundary.
- **AC-13 Privacy/secrets:** provider secrets never reach the model; PII redacted from logs; shared demand views reveal no identity/raw text.
- **AC-14 Failure safety:** unverifiable inventory/price/policy/delivery fails safe with communicated uncertainty.
- **AC-15 Evidence:** build, unit, integration, contract tests, representative E2E executed and attached to release decision.

## 14. Assumptions / decisions ledger (v1)

| ID | Decision | Value |
|---|---|---|
| PD-01 | Merchant scope | Multi-merchant SaaS isolation + default-merchant backfill |
| PD-02 | Launch channel | Telegram Bot + Web |
| PD-03 | Currency | Merchant-configured; preserve existing USD during migration; IRR fixture coverage; real launch currency must be confirmed by human before production |
| PD-04 | Checkout | Reuse existing web checkout/COD via expiring signed handoff |
| PD-05 | Variants | First-class ProductVariant; every current product gets one default variant |
| PD-06 | Social identity | Customer + CustomerChannelIdentity; verified linking only |
| PD-07 | Raw payloads | Not persisted by default |
| PD-08 | Retention | Config-driven; human/legal decision required before production |

## 15. Product stop condition

Stop and escalate when: external credentials/approvals unavailable; a platform limitation invalidates an AC; catalog lacks fields needed for truthful recommendations; a privacy/legal decision is required; migration/public contract change is required without approval; two requirements conflict; implementation would materially expand MVP1.

## 16. Versioning

Contract changes require a new version; dependent tasks and evidence become stale. This is Product Contract v1; all tasks reference it.
