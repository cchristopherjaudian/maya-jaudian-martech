import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://martech_user:martech_pass@localhost:5432/martech_test_db';

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

function databaseNameFrom(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

export default async function globalSetup(): Promise<void> {
  const dbName = databaseNameFrom(TEST_DATABASE_URL);
  const adminUrl = TEST_DATABASE_URL.replace(/\/[^/]+$/, '/postgres');

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end();
  }

  // Apply the Prisma migration SQL directly rather than shelling out to the
  // `prisma` CLI: Prisma 7's CLI loads `@prisma/dev`, which crashes with
  // ERR_REQUIRE_ESM on Node < 20.19 — a host/CLI issue unrelated to this
  // schema, and the app's own Docker image (Node 22) is unaffected.
  const test = new Client({ connectionString: TEST_DATABASE_URL });
  await test.connect();
  try {
    await test.query('DROP SCHEMA IF EXISTS public CASCADE');
    await test.query('CREATE SCHEMA public');

    const migrationDirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const dir of migrationDirs) {
      const sql = readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf-8');
      await test.query(sql);
    }
  } finally {
    await test.end();
  }
}
