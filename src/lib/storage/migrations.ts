import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import BetterSqlite3 from 'better-sqlite3';
import postgres from 'postgres';

export const MIGRATIONS_TABLE_NAME = '_migrations';

type MigrationRow = {
  name: string;
};

type SqliteConnection = InstanceType<typeof BetterSqlite3>;

function getMigrationsDir(rootDir = process.cwd()) {
  return path.join(rootDir, 'migrations');
}

export function splitMigrationStatements(sql: string) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function listMigrationFiles(rootDir = process.cwd()) {
  const entries = await fsPromises.readdir(getMigrationsDir(rootDir), {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => path.join(getMigrationsDir(rootDir), entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export function listMigrationFilesSync(rootDir = process.cwd()) {
  return fs
    .readdirSync(getMigrationsDir(rootDir), {
      withFileTypes: true,
    })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => path.join(getMigrationsDir(rootDir), entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export async function readMigrationStatements(migrationPath: string) {
  const migrationSql = await fsPromises.readFile(migrationPath, 'utf8');

  return splitMigrationStatements(migrationSql);
}

export function readMigrationStatementsSync(migrationPath: string) {
  return splitMigrationStatements(fs.readFileSync(migrationPath, 'utf8'));
}

async function ensurePostgresMigrationsTable(sql: ReturnType<typeof postgres>) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_NAME} (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);
}

async function loadAppliedPostgresMigrations(sql: ReturnType<typeof postgres>) {
  const rows = await sql<MigrationRow[]>`
    SELECT name
    FROM _migrations
    ORDER BY id ASC
  `;

  return new Set(rows.map((row) => row.name));
}

function ensureSqliteMigrationsTable(db: SqliteConnection) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE_NAME} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    )
  `);
}

function loadAppliedSqliteMigrations(db: SqliteConnection) {
  const rows = db
    .prepare(
      `
        SELECT name
        FROM _migrations
        ORDER BY id ASC
      `,
    )
    .all() as MigrationRow[];

  return new Set(rows.map((row) => row.name));
}

export async function applyPendingPostgresMigrations(
  sql: ReturnType<typeof postgres>,
) {
  await ensurePostgresMigrationsTable(sql);
  const appliedMigrations = await loadAppliedPostgresMigrations(sql);
  const migrationFiles = await listMigrationFiles();

  let appliedCount = 0;

  for (const migrationPath of migrationFiles) {
    const migrationName = path.basename(migrationPath);

    if (appliedMigrations.has(migrationName)) {
      console.log(`skip ${migrationName}`);
      continue;
    }

    const statements = await readMigrationStatements(migrationPath);

    if (!statements.length) {
      continue;
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

    appliedCount += 1;
    console.log(`apply ${migrationName}`);
  }

  return appliedCount;
}

export function applyPendingSqliteMigrations(db: SqliteConnection) {
  ensureSqliteMigrationsTable(db);

  const appliedMigrations = loadAppliedSqliteMigrations(db);
  const migrationFiles = listMigrationFilesSync();

  let appliedCount = 0;

  for (const migrationPath of migrationFiles) {
    const migrationName = path.basename(migrationPath);

    if (appliedMigrations.has(migrationName)) {
      continue;
    }

    const statements = readMigrationStatementsSync(migrationPath);

    if (!statements.length) {
      continue;
    }

    const applyMigration = db.transaction(() => {
      for (const statement of statements) {
        db.exec(statement);
      }

      db.prepare(
        `
          INSERT INTO _migrations (name, applied_at)
          VALUES (?, ?)
        `,
      ).run(migrationName, new Date().toISOString());
    });

    applyMigration();
    appliedCount += 1;
    console.log(`apply ${migrationName}`);
  }

  return appliedCount;
}
