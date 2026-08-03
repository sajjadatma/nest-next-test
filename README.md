# Nest + Prisma dashboard

A TypeScript NestJS application with a modular API, Prisma persistence, JWT authentication, and a protected browser dashboard.

The project also includes a cash-on-delivery shop at `/shop` and protected commerce operations at `/dashboard/shop`. Checkout uses atomic inventory reservations, idempotency keys, durable confirmation links, customer order history, and audited staff order transitions.

## Quick start

1. Install dependencies: `npm install`
2. Create local configuration: `cp .env.example .env`
3. Start PostgreSQL: `npm run db:up`
4. Generate Prisma and apply migrations: `npm run prisma:generate && npm run prisma:migrate:deploy`
4. Start the app: `npm run start:dev`
5. Open `http://localhost:5050`, then create an account.

## Run everything

Run `npm run dev` from the repository root to start the Nest API at `http://localhost:5050` and the Next.js dashboard at `http://localhost:3000`. Both services are bound to `127.0.0.1` and are only reachable locally. PostgreSQL runs in Docker on `127.0.0.1:5433`; start it with `npm run db:up`.

`npm run dev` always runs the complete development preflight first: Docker/PostgreSQL health, Prisma migrations, lint, type checks, backend and frontend unit tests, and integration tests. If any check fails, the servers are not started. See [Development run policy](./DEV_WORKFLOW.md) for the full flow and troubleshooting guidance. Run `npm run dev:check` when you want to validate without starting the servers.

## API documentation

Production order emails require `RESEND_API_KEY`, `ORDER_EMAIL_FROM`, and `SHOP_PUBLIC_URL`. Verify the sender domain in Resend and use a verified sender such as `NEST <orders@example.com>`. Development can omit these values; orders still receive a durable confirmation page and are marked with `SKIPPED` email status.

With the server running, Swagger UI is available at `http://localhost:5050/api/docs` and the OpenAPI JSON document at `http://localhost:5050/api/docs-json`.

## Next.js dashboard

The Porsche Design System frontend lives in [`dashboard/`](./dashboard). Start the Nest API on port 5050, then run `npm run dev` from that directory and open `http://localhost:3000/login`.

## Roles and permissions

The application uses normalized RBAC tables (`Role`, `Permission`, `UserRole`, and `RolePermission`). All new accounts receive the `user` role with `dashboard:read`. To bootstrap an administrator, add a comma-separated list of existing account emails to `ADMIN_EMAILS` in `.env`, restart the API, and use the Role management section in the dashboard. Administrators have `roles:manage` and can update role assignments.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account and return a JWT |
| POST | `/api/auth/login` | Log in and return a JWT |
| GET | `/api/auth/me` | Return the signed-in user |
| GET | `/api/dashboard` | Protected dashboard metrics and recent users |

Use `Authorization: Bearer <accessToken>` for protected API routes. Configure a 32-character-or-longer `JWT_SECRET`, an explicit `FRONTEND_ORIGINS` allow-list, and a PostgreSQL `DATABASE_URL` before deploying. See [Phase 1 production foundation](./docs/phase-1-production-foundation.md) for the full runtime and database cutover guidance.
