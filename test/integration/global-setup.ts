import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { applySqliteMigrations } from '../helpers/sqlite-migrations';

const databaseFile = resolve(process.cwd(), 'prisma/test-api.db');

export default function setup() {
  rmSync(databaseFile, { force: true });
  process.env.DATABASE_URL = 'file:./test-api.db';
  process.env.JWT_SECRET = 'integration-test-secret';
  process.env.ADMIN_EMAILS = '';
  applySqliteMigrations(databaseFile);
  return () => rmSync(databaseFile, { force: true });
}
