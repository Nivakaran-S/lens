#!/usr/bin/env node
// Tiny SQL migrator for MariaDB/MySQL. Reads migrations/*.sql in lexical
// order and applies each (split on ';') tracked in __migrations.
//
// Usage:
//   DATABASE_URL=mysql://USER:PASS@HOST:PORT/DB node scripts/migrate.js
//
// Or via package.json: `npm run db:migrate`.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const conn = await mysql.createConnection({
  uri: url,
  multipleStatements: true,
  // Migrations contain CHECK / FK / CREATE INDEX in one file — we need
  // multi-statement execution.
});

await conn.query(`
  CREATE TABLE IF NOT EXISTS __migrations (
    filename VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB
`);

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const [appliedRows] = await conn.query('SELECT filename FROM __migrations');
const appliedSet = new Set(appliedRows.map((r) => r.filename));

for (const f of files) {
  if (appliedSet.has(f)) {
    console.log(`SKIP  ${f}`);
    continue;
  }
  const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
  console.log(`APPLY ${f}`);
  try {
    await conn.beginTransaction();
    // mysql2 with multipleStatements: true accepts multi-statement SQL.
    await conn.query(sql);
    await conn.query('INSERT INTO __migrations (filename) VALUES (?)', [f]);
    await conn.commit();
    console.log(`  ok`);
  } catch (err) {
    await conn.rollback();
    console.error(`  FAILED: ${err.message}`);
    process.exit(1);
  }
}

await conn.end();
console.log('migrations: done');
