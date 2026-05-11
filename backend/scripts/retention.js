#!/usr/bin/env node
// GDPR storage-limitation sweep. Deletes jobs (and their files) for any
// terminal-state job older than RETENTION_DAYS_JOBS days.
//
// Run on a cron, e.g. daily at 03:00:
//   0 3 * * *  cd /var/www/vhosts/.../backend && /opt/plesk/node/22/bin/npm run db:retention
//
// Or invoke once manually:
//   RETENTION_DAYS_JOBS=90 DATABASE_URL=... UPLOAD_DIR=... node scripts/retention.js

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
const uploadDir = process.env.UPLOAD_DIR;
const retentionDays = Math.max(0, parseInt(process.env.RETENTION_DAYS_JOBS ?? '90', 10));

if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
if (!uploadDir) {
  console.error('UPLOAD_DIR is required');
  process.exit(1);
}
if (retentionDays === 0) {
  console.log('RETENTION_DAYS_JOBS=0 — sweep disabled. Exiting.');
  process.exit(0);
}

const root = path.resolve(uploadDir);
const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
const cutoffSql = cutoff.toISOString().slice(0, 23).replace('T', ' ');

const conn = await mysql.createConnection({ uri: databaseUrl });

const [rows] = await conn.execute(
  `SELECT id, user_id FROM jobs
   WHERE status IN ('done', 'failed')
     AND updated_at < ?`,
  [cutoffSql],
);

console.log(`retention: ${rows.length} job(s) past the ${retentionDays}-day cutoff`);

let deletedFiles = 0;
let deletedRows = 0;

for (const row of rows) {
  const dir = path.resolve(root, row.user_id, row.id);
  // Guard: must still be inside UPLOAD_DIR.
  if (!dir.startsWith(root + path.sep)) {
    console.error(`retention: refusing to rm path outside UPLOAD_DIR: ${dir}`);
    continue;
  }

  try {
    await fsp.rm(dir, { recursive: true, force: true });
    deletedFiles++;
  } catch (err) {
    console.error(`retention: rm failed for ${dir}: ${err.message}`);
  }

  try {
    await conn.execute('DELETE FROM jobs WHERE id = ?', [row.id]);
    deletedRows++;
  } catch (err) {
    console.error(`retention: db delete failed for job ${row.id}: ${err.message}`);
  }
}

await conn.end();
console.log(`retention: done. files_removed=${deletedFiles} rows_removed=${deletedRows}`);
