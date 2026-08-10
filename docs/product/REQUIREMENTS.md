# REQUIREMENTS.md — MVP1 Requirements (localized to live repository)

**Spec:** PRODUCT-CONTRACT v1 / requirements subset
**Repository facts verified at:** revision `7ff60cb` (branch `shop_v1`)

## 1. Live repository baseline

| Area | Verified fact |
|---|---|
| Backend | NestJS 11 (installed @nestjs/common 11.1.28), TypeScript 5.9.3, global prefix `/api`, global ValidationPipe (whitelist/transform/forbidNonWhitelisted) |
| Database | PostgreSQL 16 (Docker `nest-postgres-1`, port 127.0.0.1:5433), Prisma 6.19.3 |
| ORM | Prisma; migrations in `prisma/migrations/` (9 existing), `DATABASE_URL` in `.env` |
| Auth | JWT + refresh rotation (`src/auth/`), optional JWT guard for shop browsing |
| RBAC | `src/rbac/` — PermissionKey constants, PermissionsGuard, RequirePermissions/RequireAnyPermissions decorators |
| Shop core | `src/shop/` — catalog, product by slug, comments, favorites, shipping methods, order quote, idempotent COD orders, atomic stock reservation, promotions, inventory movements, analytics, audit feed |
| Dashboard | `dashboard/` Next.js 16.2.11 + React 19.2.4 + Porsche Design System, Zustand cart (client-side), pages under `dashboard/src/app/shop/` and `dashboard/src/app/dashboard/shop/` |
| Observability | nestjs-pino + `x-request-id` correlation, redacted auth/cookie headers, Sentry optional, `SystemLog`, `AuditLog` |
| Quality gates | `npm run lint` / `typecheck` / `test:unit` / `test:frontend` / `test:integration` / `test:database` / `build` / `test:e2e`; `npm run test:preflight` runs lint+typecheck+unit+frontend+integration |
| Orders | `CreateOrderDto` (email, phone, idempotencyKey UUID, confirmationToken UUID, items max 20/line, shippingAddress), `OrderStatus` PENDING→…→DELIVERED/FULFILLED/CANCELLED, `Payment` COD |
| Existing gaps | No Merchant, no ProductVariant, no Conversation/Message, no cart server-side, no AI gateway/tools, no channels, no demand events, no Persian/RTL |

## 2. Reuse map (explicit)

| Requirement | Reused capability |
|---|---|
| Catalog truth | `Product`, `Category`, `ProductImage`, `ShopService.publicProduct*` |
| Inventory | `Product.stockQty`, `InventoryMovement`, atomic `updateMany` reservation |
| Order/checkout | `CreateOrderDto`, `createOrder` idempotency, `OrderStatusEvent`, confirmation page |
| Shipping | `ShippingMethod`, `quoteOrder` |
| Auth/RBAC | `src/auth/*`, `src/rbac/*` (+ new permission keys) |
| Audit | `AuditService.record`, `AuditLog` |
| Admin UI | `dashboard/src/app/dashboard/shop/*`, `ShopAdminNavigation`, `DashboardClient` |
| Frontend types | `dashboard/src/components/shop-types.ts`, `shop-admin-types.ts`, `lib/api.ts` (axios, refresh) |

## 3. Migration requirements (data-preserving)

1. New `Merchant` + `MerchantMembership`; single default merchant backfill; `Product.merchantId` non-null after backfill.
2. `ProductVariant` per product (default variant from current price/stock); existing product URLs/checkout remain compatible.
3. All new tables: `ChannelAccount`, `Customer`, `CustomerChannelIdentity`, `Conversation`, `Message`, `Cart`, `CartItem`, `HumanHandoff`, `DemandEvent` (in later tasks).
4. No destructive change to existing rows; migration rehearsed on fresh DB; row counts verified; rollback notes required.

## 4. Non-functional requirements

- Persian (RTL) + English text support in customer-facing copy; dashboard keyboard-accessible; tablet usable.
- Correlation ID flows webhook → outbound.
- Fail closed on unverifiable inventory/price.
- Secrets encrypted at rest, never in model context, redacted in logs.
- Rate limits/abuse controls; idempotency keys; retry with dead-letter awareness only if a queue is approved.

## 5. Deterministic evaluation set (required)

Persian product-search requests; incomplete requests requiring one clarification; exact/partial matches; no-match; out-of-stock; price-too-high; comparison + positional references; cart/checkout handoff; angry/refund/payment/handoff; duplicate webhook delivery; malformed provider payload; unauthorized merchant access; stale price/inventory; channel delivery failure + retry.

## 6. Test layers

1. schema/contract; 2. domain unit; 3. repository + authorization; 4. adapter webhook; 5. orchestrator integration; 6. tool-call + response validation; 7. E2E web/channel; 8. security/load/failure proportional to release risk.
LLM evals test: tool selection, factual grounding, refusal/escalation, language quality, structured outcome emission.

## 7. Open product blockers (owned by human)

- Real launch merchant currency (PD-03) before production.
- Conversation retention period + legal basis + deletion obligations (PD-08) before production.
- LLM provider + data-processing terms + credentials (TD-01) before production channel launch.
