const { rmSync, readdirSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const databaseFile = resolve(process.cwd(), 'prisma/e2e.db');
rmSync(databaseFile, { force: true });
const database = new DatabaseSync(databaseFile);
database.exec('PRAGMA foreign_keys = ON;');
for (const directory of readdirSync(resolve(process.cwd(), 'prisma/migrations')).sort()) {
  database.exec(readFileSync(join(process.cwd(), 'prisma/migrations', directory, 'migration.sql'), 'utf8'));
}
database.close();
