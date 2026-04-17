import './load-env';

import fs from 'node:fs';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import postgres from 'postgres';

import {
  getDatabasePath,
  getDatabaseProvider,
  getMigrationDatabaseUrl,
} from '@/lib/config/env';
import {
  applyPendingPostgresMigrations,
  applyPendingSqliteMigrations,
} from '@/lib/storage/migrations';

async function main() {
  if (getDatabaseProvider() === 'sqlite') {
    const databasePath = path.resolve(process.cwd(), getDatabasePath());

    fs.mkdirSync(path.dirname(databasePath), {
      recursive: true,
    });

    const db = new BetterSqlite3(databasePath);

    try {
      const appliedCount = applyPendingSqliteMigrations(db);
      console.log(`done, applied ${appliedCount} migration(s)`);
    } finally {
      db.close();
    }

    return;
  }

  const databaseUrl = getMigrationDatabaseUrl();

  if (!databaseUrl) {
    throw new Error(
      '未配置 MIGRATION_DATABASE_URL、POSTGRES_URL_NON_POOLING、DATABASE_URL 或 POSTGRES_URL',
    );
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 15,
  });

  try {
    const appliedCount = await applyPendingPostgresMigrations(sql);
    console.log(`done, applied ${appliedCount} migration(s)`);
  } finally {
    await sql.end({
      timeout: 5,
    });
  }
}

void main();
