# Nest + Prisma dashboard

A TypeScript NestJS application with a modular API, Prisma persistence, JWT authentication, and a protected browser dashboard.

## Quick start

1. Install dependencies: `npm install`
2. Create local configuration: `cp .env.example .env`
3. Create the SQLite database and Prisma client: `npx prisma migrate dev --name init`
4. Start the app: `npm run start:dev`
5. Open `http://localhost:5050`, then create an account.

## API documentation

With the server running, Swagger UI is available at `http://localhost:5050/api/docs` and the OpenAPI JSON document at `http://localhost:5050/api/docs-json`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account and return a JWT |
| POST | `/api/auth/login` | Log in and return a JWT |
| GET | `/api/auth/me` | Return the signed-in user |
| GET | `/api/dashboard` | Protected dashboard metrics and recent users |

Use `Authorization: Bearer <accessToken>` for protected API routes. Change `JWT_SECRET` before deploying; SQLite is a local-development default and can be swapped for PostgreSQL by updating Prisma's datasource and `DATABASE_URL`.
