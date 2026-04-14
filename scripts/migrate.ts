import './load-env';

import fs from 'node:fs/promises';
import path from 'node:path';

import postgres from 'postgres';

import { getMigrationDatabaseUrl } from '@/lib/config/env';

const MIGRATIONS_TABLE_NAME = '_migrations';

type MigrationRow = {
  name: string;
};

function splitStatements(sql: string) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function ensureMigrationsTable(sql: ReturnType<typeof postgres>) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_NAME} (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);
}

async function loadAppliedMigrations(sql: ReturnType<typeof postgres>) {
  const rows = await sql<MigrationRow[]>`
    SELECT name
    FROM _migrations
    ORDER BY id ASC
  `;

  return new Set(rows.map((row) => row.name));
}

async function listMigrationFiles() {
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const entries = await fs.readdir(migrationsDir, {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => path.join(migrationsDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function applyMigration(
  sql: ReturnType<typeof postgres>,
  migrationPath: string,
) {
  const migrationName = path.basename(migrationPath);
  const migrationSql = await fs.readFile(migrationPath, 'utf8');
  const statements = splitStatements(migrationSql);

  if (!statements.length) {
    return false;
  }

  await sql.begin(async (transactionSql) => {
    for (const statement of statements) {
      await transactionSql.unsafe(statement);
    }

    await transactionSql`
      INSERT INTO _migrations (name, applied_at)
      VALUES (${migrationName}, ${new Date().toISOString()})
    `;
  });

  return true;
}

async function main() {
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
    await ensureMigrationsTable(sql);
    const appliedMigrations = await loadAppliedMigrations(sql);
    const migrationFiles = await listMigrationFiles();

    let appliedCount = 0;

    for (const migrationPath of migrationFiles) {
      const migrationName = path.basename(migrationPath);

      if (appliedMigrations.has(migrationName)) {
        console.log(`skip ${migrationName}`);
        continue;
      }

      const applied = await applyMigration(sql, migrationPath);

      if (applied) {
        appliedCount += 1;
        console.log(`apply ${migrationName}`);
      }
    }

    console.log(`done, applied ${appliedCount} migration(s)`);
  } finally {
    await sql.end({
      timeout: 5,
    });
  }
}

void main();
