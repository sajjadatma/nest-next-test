# Nest + Prisma dashboard

A TypeScript NestJS application with a modular API, Prisma persistence, JWT authentication, and a protected browser dashboard.

## Quick start

1. Install dependencies: `npm install`
2. Create local configuration: `cp .env.example .env`
3. Start PostgreSQL: `npm run db:up`
4. Generate Prisma and apply migrations: `npm run prisma:generate && npm run prisma:migrate:deploy`
4. Start the app: `npm run start:dev`
5. Open `http://localhost:5050`, then create an account.

## Run everything

Run `npm run dev` from the repository root to start the Nest API at `http://localhost:5050` and the Next.js dashboard at `http://localhost:3000`. Both services are bound to `127.0.0.1` and are only reachable locally. PostgreSQL runs in Docker on `127.0.0.1:5433`; start it with `npm run db:up`.

## API documentation

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
