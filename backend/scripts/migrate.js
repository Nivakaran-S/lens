#!/usr/bin/env node
// Tiny SQL migrator. Reads migrations/*.sql in lexical order and applies
// each in a transaction, tracking applied filenames in a __migrations table.
// Idempotent: re-runs skip already-applied files.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/migrate.js
//
// Or via package.json: `npm run db:migrate`.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS __migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows: applied } = await client.query('SELECT filename FROM __migrations');
  const appliedSet = new Set(applied.map((r) => r.filename));

  for (const f of files) {
    if (appliedSet.has(f)) {
      console.log(`SKIP  ${f}`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    console.log(`APPLY ${f}`);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO __migrations (filename) VALUES ($1)', [f]);
      await client.query('COMMIT');
      console.log(`  ok`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  FAILED: ${err.message}`);
      process.exit(1);
    }
  }

  await client.end();
  console.log('migrations: done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
