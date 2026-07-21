# Nest + Prisma dashboard

A TypeScript NestJS application with a modular API, Prisma persistence, JWT authentication, and a protected browser dashboard.

## Quick start

1. Install dependencies: `npm install`
2. Create local configuration: `cp .env.example .env`
3. Create the SQLite database and Prisma client: `npx prisma migrate dev --name init`
4. Start the app: `npm run start:dev`
5. Open `http://localhost:5050`, then create an account.

## Run everything

Run `npm run dev` from the repository root to start the Nest API at `http://localhost:5050` and the Next.js dashboard at `http://localhost:3000`. Both services are bound to `127.0.0.1` and are only reachable locally. The project uses SQLite through Prisma, so the database is the local `prisma/dev.db` file and needs no separate server process.

## API documentation

With the server running, Swagger UI is available at `http://localhost:5050/api/docs` and the OpenAPI JSON document at `http://localhost:5050/api/docs-json`.

## Next.js dashboard

The Porsche Design System frontend lives in [`dashboard/`](./dashboard). Start the Nest API on port 5050, then run `npm run dev` from that directory and open `http://localhost:3000/login`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account and return a JWT |
| POST | `/api/auth/login` | Log in and return a JWT |
| GET | `/api/auth/me` | Return the signed-in user |
| GET | `/api/dashboard` | Protected dashboard metrics and recent users |

Use `Authorization: Bearer <accessToken>` for protected API routes. Change `JWT_SECRET` before deploying; SQLite is a local-development default and can be swapped for PostgreSQL by updating Prisma's datasource and `DATABASE_URL`.
