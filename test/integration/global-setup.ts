import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;

export default async function setup() {
  process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';
  process.env.AUTH_RATE_LIMIT_MAX = '1000';
  container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.JWT_SECRET = 'integration-test-secret-must-be-at-least-32-characters';
  process.env.ADMIN_EMAILS = '';
  process.env.FRONTEND_ORIGINS = 'http://127.0.0.1:3000';
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
  return async () => container.stop();
}
