# SYSTEM.md — Engineering Baseline (MVP1, repository-localized)

**Version:** v1 — frozen by ORC (Sol Medium) after human approval of PLAN v0.1
**Repository:** /Users/sajad/Documents/Tasks/Projects/nest @ `shop_v1`

## 1. Verified versions (do not guess)

| Component | Version | Source |
|---|---|---|
| Node.js | 25.9.0 (shell) | `node --version` |
| npm | 11.12.1 | `npm --version` |
| NestJS core/common | 11.1.28 | `npm ls` |
| Prisma / @prisma/client | 6.19.3 | `npm ls` |
| TypeScript | 5.9.3 | `npm ls` |
| Next.js | 16.2.11 | `dashboard/package.json` |
| React | 19.2.4 | `dashboard/package.json` |
| Vitest | 4.1.10 | `npm ls` |
| Playwright | 1.61.1 | `npm ls` |
| PostgreSQL | 16 (Docker, port 5433) | `docker compose ps` |
| Validators | class-validator 0.14.x, zod 4.4.x | `npm ls` |

No version may be changed without ORC approval.

## 2. Architecture

Modular monolith. Existing modules (`auth`, `rbac`, `admin`, `dashboard`, `audit`, `system-logs`, `shop`, `account`, `health`) stay intact. New bounded modules:

| Module | Responsibility | Must not do |
|---|---|---|
| `src/merchant/` | Merchant + membership, scoping | Contain conversation/AI logic |
| `src/commerce/` | Approved tool facade over shop truth | Query Prisma directly for presentation; contain model calls |
| `src/conversations/` | Normalized messages, state, references, handoff | Translate channel payloads; contain commerce truth |
| `src/ai/` | Provider-neutral gateway, policy, response validation | Query Prisma; call arbitrary HTTP/SQL/shell |
| `src/channels/` | Adapter boundary + Telegram | Contain commerce or AI logic |
| `src/demand/` | DemandEvent pipeline + deterministic aggregates | Expose raw identity/text |

Dependency direction: `channels → conversations → ai → commerce → shop/prisma`; `demand` consumes structured outcomes only.

## 3. Approved dependencies

Existing approved set only. Additions require ORC approval with rationale + license + maintenance check. Prohibited: microservices frameworks, vector DBs, Redis/BullMQ (until measured requirement), new payment providers, generalized agent frameworks, streaming/warehouse platforms.

## 4. Coding conventions (existing patterns)

- Nest modules with explicit `*.module.ts`; controllers thin, services own logic; DTOs in `dto/` with class-validator decorators; swagger decorators on controllers.
- Global validation: `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`.
- Errors: `BadRequestException` / `ConflictException` / `NotFoundException` with deterministic messages; no raw Prisma errors to clients.
- Prisma: schema changes via migrations; raw SQL only inside migration files or audited analytics queries.
- Idempotency: unique keys + `updateMany`-style guarded mutations (existing order pattern).
- Frontend: `src/lib/api.ts` axios wrapper; client components under `dashboard/src/components/`; pages under `dashboard/src/app/`; money via `shop-types.ts` helper.
- Persian/RTL: HTML `dir="rtl"` + `lang="fa"` at page level; no hard-coded English-only strings in new customer-facing components.
- Logs/audit: pino (redacted headers), `AuditService.record(action, targetType, targetId, actorId, metadata)`.

## 5. Protected files (no modification without explicit ORC task grant)

`.env`, `package.json`, `package-lock.json`, `dashboard/package*.json`, `docker-compose.yml`, existing `prisma/migrations/*`, `src/main.ts`, `src/app.module.ts`, `src/auth/**`, `src/rbac/**`, `src/audit/**`, `src/observability/**`, existing order/stock invariants in `src/shop/shop.service.ts`, CI/build config, generated output (`dist/`, `dashboard/.next/`, Prisma client, `*.tsbuildinfo`).

## 6. Quality gates (mandatory)

- `npm run lint` (0 warnings)
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:frontend`
- `npm run test:integration`
- `npm run test:database` (fresh PostgreSQL via testcontainers)
- `npm run build`
- `npm run test:e2e` (final gate)
- Migration rehearsal on fresh DB; contract validation; dependency audit; security review at final gate.

## 7. Golden Examples

Before large parallel work, the following complete, tested slices are created and future code must follow them:

1. Backend Golden Example: `src/commerce/commerce-tools.service.ts` (search_products + get_product) with strict schema, merchant scoping, deterministic errors, audit, correlation, tests (task MVP1-B03).
2. Frontend Golden Example: Web chat customer component set with RTL + accessibility (task MVP1-F01).
3. AI Golden Example: `src/ai/` gateway + policy + validator with deterministic fake provider (task MVP1-B07).

## 8. Deployment / runtime facts

- Dev: `npm run dev` → API :5050 + dashboard :3000; DB via `npm run db:up`.
- Production env required: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_ORIGINS`, `SENTRY_DSN` optional; `SHOP_PUBLIC_URL` etc. (existing).
- No deployment/push without explicit human authorization.
