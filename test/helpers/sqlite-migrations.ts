import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function applySqliteMigrations(databaseFile: string) {
  const database = new DatabaseSync(databaseFile);
  database.exec('PRAGMA foreign_keys = ON;');
  const migrationsDirectory = resolve(process.cwd(), 'prisma/migrations');
  for (const directory of readdirSync(migrationsDirectory).sort()) {
    database.exec(readFileSync(join(migrationsDirectory, directory, 'migration.sql'), 'utf8'));
  }
  database.close();
}
