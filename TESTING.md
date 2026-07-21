# Testing

The suite is layered so fast checks run before container and browser work. All commands are run from the repository root.

| Category | Command | What it covers |
| --- | --- | --- |
| Lint | `npm run lint` | Nest, test helpers, and Next.js source linting |
| Types | `npm run typecheck` | Nest build types and Next.js TypeScript types |
| Backend unit | `npm run test:unit` | Authentication business rules, DTO validation, and RBAC permission composition |
| Frontend | `npm run test:frontend` | React interactions and loading/success/error states using MSW API handlers |
| API integration | `npm run test:integration` | Supertest requests against an isolated migrated SQLite database |
| Database | `npm run test:database` | SQLite migration deployment plus PostgreSQL Testcontainers constraints, cascades, transactions, and relation queries |
| Browser E2E | `npm run test:e2e` | Chromium registration, profile update, sign-out, and sign-in journey |
| Full CI order | `npm run test:ci` | Lint → types → unit/frontend → integration/database → build → E2E |

`npm run dev` runs the fast preflight (lint, type-check, unit, frontend, and API integration tests) before it starts the API and dashboard. `npm run start:dev` runs the backend unit and API integration checks first. The Docker database suite and browser E2E suite remain release/CI gates so normal development startup stays fast.

## Prerequisites

- Node.js 22 or newer
- Docker running for `npm run test:database` (Testcontainers starts a disposable PostgreSQL 16 container)
- Playwright Chromium for E2E: `npx playwright install chromium`

## Isolation

- Supertest integration tests migrate `prisma/test-api.db` from scratch and delete it after the run.
- Browser tests migrate `prisma/e2e.db` before starting Nest on port `5051` and Next.js on port `3001`; these ports avoid the usual local development ports.
- PostgreSQL tests create and stop their own Testcontainer in hooks. The command disables Testcontainers' auxiliary reaper because explicit cleanup makes the suite faster and independent of pulling that additional image. No application database is reused.
- Frontend tests mock only HTTP boundaries with MSW. Backend and database tests use real Prisma persistence.

## Adding coverage

Put focused Nest business-rule tests beside the code as `*.spec.ts`. Put HTTP tests under `test/integration`, reusable database tests under `test/database`, and dashboard tests beside the relevant component. Keep browser coverage to stable, high-value journeys; exercise edge cases at the unit, API, or component level instead.
