# Contracts — Commerce Tools (v1)

**Frozen by:** ORC (Sol Medium), 2026-08-10 — see ADR-003/005.

## Tool registry (MVP1 allow-list)

`search_products`, `get_product`, `check_inventory`, `get_price`, `get_product_images`, `compare_products`, `get_shipping_estimate`, `get_customer_context`, `create_cart`, `add_to_cart`, `create_checkout_link`, `handoff_to_human`, `record_demand_outcome`

## Every tool must have

1. Strict input schema (class-validator/zod, `forbidNonWhitelisted`).
2. Authorization check + merchant scoping at service boundary.
3. Timeout and retry policy (existing conventions; no queue without approval).
4. Structured result schema (below pattern).
5. Audit/log event (`AuditService.record` + pino with correlation id).
6. Deterministic error codes:

```text
TOOL_NOT_FOUND | INVALID_INPUT | UNAUTHORIZED | MERCHANT_MISMATCH
PRODUCT_NOT_FOUND | VARIANT_NOT_FOUND | OUT_OF_STOCK | INSUFFICIENT_STOCK
PRICE_UNVERIFIABLE | INVENTORY_UNVERIFIABLE | SHIPPING_UNVERIFIABLE
CART_NOT_FOUND | CHECKOUT_LINK_EXPIRED | CHECKOUT_LINK_INVALID
HANDOFF_REQUIRED | UPSTREAM_TIMEOUT | UPSTREAM_ERROR | INTERNAL
```

Fail-closed rule: if price or stock cannot be verified, return `*_UNVERIFIABLE` — never a guessed value.

## Result envelope pattern

```ts
type ToolResult<T> = { ok: true; data: T; at: string } | { ok: false; code: string; message: string; at: string };
```

## Key tool schemas (v1)

### search_products
- Input: `{ merchantId, query?: string, category?: string, attributes?: Record<string,string>, size?: string, budgetMin?: number, budgetMax?: number, currency?: string, limit?: number (1..10) }`
- Result items: `{ productId, variantId, slug, title, description?, category: {name,slug}, priceMinor, currency, availability, imageUrl?, productUrl, canonicalAttributes }`
- Semantics: exact/partial match on canonical attributes; deterministic ordering (relevance → price asc); no-match is a valid result with `matched: false`.

### get_product / get_product_images / check_inventory / get_price / compare_products / get_shipping_estimate
- All read-only; results derive from shop domain at call time; compare accepts `productIds[]` (2..4) and returns side-by-side variant rows with verified fields only.

### create_cart / add_to_cart
- Cart scoped to `(merchantId, customerId|externalUserId, conversationId?)`; `add_to_cart` input includes `variantId` + `quantity` (1..20); revalidates availability; returns cart summary with current prices.

### create_checkout_link
- Input: `{ cartId }`; returns signed, expiring URL into existing web checkout; signature covers merchant, cart, variant lines, price reference, expiry; tamper/expiry → CHECKOUT_LINK_INVALID/EXPIRED.
- Price/stock revalidated at order creation (existing atomic reservation preserved).

### handoff_to_human
- Creates HumanHandoff record with reason code; returns summary for operator; stops autonomous mutation.

### record_demand_outcome
- Creates/updates DemandEvent per demand contract; idempotent per conversation+intent key.

## Prohibited

Any tool that: executes arbitrary SQL/HTTP/shell, touches payments, mutates catalog/inventory outside approved flows, reads another merchant's data, or exposes raw conversation/identity in results.

---

## B04 tool schemas v1.1 (exact; ORC-approved 2026-08-10)

### check_inventory
- Input: `{ merchantId: string, variantId: string }`
- Result data: `{ variantId, productId, sku, stockQty: number, availability: 'IN_STOCK' | 'OUT_OF_STOCK', at }`
- Errors: VARIANT_NOT_FOUND (absent for merchant), INVALID_INPUT, INVENTORY_UNVERIFIABLE (lookup failure)

### get_price
- Input: `{ merchantId: string, variantId: string }`
- Result data: `{ variantId, productId, priceMinor: number, currency: string, updatedAt: string, at }`
- Errors: VARIANT_NOT_FOUND, INVALID_INPUT, PRICE_UNVERIFIABLE

### get_product_images
- Input: `{ merchantId: string, productId: string }`
- Result data: `{ productId, images: Array<{ id, url, alt, position }>, at }` (empty array is valid)
- Errors: PRODUCT_NOT_FOUND, INVALID_INPUT

### compare_products
- Input: `{ merchantId: string, productIds: string[] }` (2..4 ids)
- Result data: `{ items: Array<{ productId, variantId, slug, title, priceMinor, currency, availability, imageUrl?, canonicalAttributes }>, at }` — variant rows from the SAME read model used by search_products
- Errors: INVALID_INPUT (count outside 2..4), PRODUCT_NOT_FOUND (any id missing for merchant), MERCHANT_MISMATCH

### get_shipping_estimate
- Input: `{ merchantId: string }` (items/quote optional in later task; MVP1 returns available methods only)
- Result data: `{ methods: Array<{ id, label, description?, eta, priceMinor }>, at }` — from ShippingMethod via the commerce shipping read port; no order creation, no stock reservation
- Errors: SHIPPING_UNVERIFIABLE (read failure)

## B09 tool schemas v1.2 (exact; ORC-approved 2026-08-10)

Merchant identity source: ToolContext gains `merchantId: string` (populated by the caller/orchestrator from header x-merchant-id, JWT scope, or default merchant for MVP1 web). Tools NEVER take merchantId from the model input; they read it from ToolContext. ToolContext = { correlationId, actorId?, merchantId }.

### create_cart
- Input: `{}` (context supplies merchantId; optional scoping hints come via context: customerId/externalUserId/conversationId)
- Result data: `{ cartId, status: 'ACTIVE', itemCount: 0, items: [], at }`
- Errors: INVALID_INPUT, INTERNAL

### add_to_cart
- Input: `{ cartId: string, variantId: string, quantity: number }` (quantity 1..20)
- Result data: `{ cartId, items: Array<{ variantId, productId, sku, title, quantity, unitPriceMinor, currency, availability }>, itemCount, subtotalMinor, at }` — availability revalidated at call time
- Errors: CART_NOT_FOUND, VARIANT_NOT_FOUND, INSUFFICIENT_STOCK, INVALID_INPUT, MERCHANT_MISMATCH

### create_checkout_link
- Input: `{ cartId: string }`
- Result data: `{ checkoutUrl: string, expiresAt: string, cartId, at }` — HMAC-SHA256 signed URL into existing /shop/checkout flow; TTL 30 minutes
- Errors: CART_NOT_FOUND, CART_EMPTY (no items), CHECKOUT_LINK_UNVERIFIABLE (signing failure), INTERNAL

### get_customer_context (B04b - after B05 Customer persistence)
- Input: `{ merchantId: string, customerId: string }`
- Result data: `{ customerId, hasUserAccount: boolean, conversationCount: number, orderCount: number, at }`
- PERMITTED: customerId, boolean/aggregate fields above (non-identifying, merchant-scoped)
- REDACTED (never in result/logs): email, phone, external handles, external user ids, raw addresses, conversation text, channel identities
- Errors: CUSTOMER_NOT_FOUND, INVALID_INPUT
