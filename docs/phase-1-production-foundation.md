# Phase 1 — Production Foundation

## PostgreSQL cutover

The application now uses PostgreSQL. Start the local database and apply the production migration baseline:

```bash
npm run db:up
npm run prisma:generate
npm run prisma:migrate:deploy
```

The local Compose service is exposed on port `5433` to avoid clashing with other local PostgreSQL installations.

The previous SQLite migrations were replaced by a PostgreSQL baseline because their SQLite-specific SQL cannot safely be replayed against PostgreSQL. Existing SQLite development data is not automatically imported. For a real cutover, take a backup, export the legacy data, load it into a temporary PostgreSQL environment, validate row counts and RBAC relationships, then point `DATABASE_URL` at the new database during a maintenance window.

## Required production environment

- `DATABASE_URL`: PostgreSQL connection URL
- `JWT_SECRET`: at least 32 characters, stored in a secret manager
- `FRONTEND_ORIGINS`: comma-separated, explicit HTTPS dashboard origins
- `REDIS_URL` and `REDIS_TLS`: validated now; used by Phase 3 cache/queue infrastructure
- `SENTRY_DSN`: optional production error reporting destination
- `HOST`, `PORT`, `LOG_LEVEL`, `RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX`, `TRUST_PROXY`

## Runtime safeguards

- Helmet security headers and an explicit CORS allow-list are enabled.
- Global throttling is enabled; login and registration use a tighter five-attempts-per-minute limit.
- `GET /api/health/live` is a process liveness probe; `GET /api/health/ready` verifies PostgreSQL connectivity.
- Pino request logs include an `x-request-id`; authorization and cookie headers are redacted.
- Sentry is initialized only when `SENTRY_DSN` is configured.
- Nest shutdown hooks close Prisma safely on `SIGINT` and `SIGTERM`.
