import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { applySqliteMigrations } from '../helpers/sqlite-migrations';

describe('SQLite migration deployment', () => {
  const databaseFile = resolve(process.cwd(), 'prisma/migration-test.db');

  afterEach(() => rmSync(databaseFile, { force: true }));

  it('applies all committed migrations to an empty database', async () => {
    applySqliteMigrations(databaseFile);
    expect(existsSync(databaseFile)).toBe(true);
    const prisma = new PrismaClient({ datasources: { db: { url: `file:${databaseFile}` } } });
    await expect(prisma.user.count()).resolves.toBe(0);
    await expect(prisma.permission.count()).resolves.toBe(0);
    await prisma.$disconnect();
  });
});
