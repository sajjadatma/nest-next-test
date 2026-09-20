# Development run policy

`npm run dev` is the single supported command for starting the local stack.

Before either application server starts, its `predev` lifecycle hook runs `dev:check`:

1. Start (or reuse) PostgreSQL with Docker Compose and wait for its health check.
2. Apply all committed Prisma migrations to the development database.
3. Run backend and dashboard lint checks.
4. Run TypeScript checks for both workspaces.
5. Run backend unit tests and dashboard tests.
6. Run backend integration tests against an isolated PostgreSQL test database.
7. Start the Nest API and Next.js dashboard together only when every check passes.

If a check fails, `npm run dev` stops and prints the failing command. Fix the failure and rerun it; do not start the servers manually with partially validated state.

The expected local endpoints are:

- API: `http://127.0.0.1:5050/api`
- Swagger: `http://127.0.0.1:5050/api/docs`
- Dashboard: `http://127.0.0.1:3000`
- PostgreSQL: `127.0.0.1:5433`

To run only the validation phase, use `npm run dev:check`. To stop PostgreSQL after development, use `npm run db:down`.
