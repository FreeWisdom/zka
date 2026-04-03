import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const globalForSqlite = globalThis as typeof globalThis & {
  sqlite?: Database.Database;
};

function resolveDatabasePath() {
  const configuredPath = process.env.DATABASE_PATH ?? './data/platform-b.db';
  const normalizedRelativePath = configuredPath.replace(/^\.?[\\/]/, '');

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/* turbopackIgnore: true */ process.cwd(), normalizedRelativePath);
}

function initializeDatabase(db: Database.Database) {
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS upstream_codes (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      upstream_code_encrypted TEXT NOT NULL,
      upstream_code_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      last_error_message TEXT,
      activated_at TEXT,
      invalid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS redeem_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      product_id TEXT NOT NULL,
      upstream_code_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      submitted_at TEXT,
      redeemed_at TEXT,
      locked_at TEXT,
      last_error_message TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (upstream_code_id) REFERENCES upstream_codes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS redeem_requests (
      id TEXT PRIMARY KEY,
      request_no TEXT NOT NULL UNIQUE,
      redeem_code_id TEXT NOT NULL,
      attempt_no INTEGER NOT NULL,
      retry_of_request_id TEXT,
      session_info_masked TEXT NOT NULL,
      session_info_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      upstream_status_code INTEGER,
      upstream_response TEXT,
      error_message TEXT,
      submitted_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (redeem_code_id, attempt_no),
      FOREIGN KEY (redeem_code_id) REFERENCES redeem_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (retry_of_request_id) REFERENCES redeem_requests(id)
    );

    CREATE INDEX IF NOT EXISTS idx_upstream_codes_product_status
      ON upstream_codes (product_id, status);
    CREATE INDEX IF NOT EXISTS idx_redeem_codes_status_issued
      ON redeem_codes (status, issued_at);
    CREATE INDEX IF NOT EXISTS idx_redeem_requests_status_created
      ON redeem_requests (status, created_at);
    CREATE INDEX IF NOT EXISTS idx_redeem_requests_session_hash
      ON redeem_requests (session_info_hash);
  `);
}

export function getDatabase() {
  if (!globalForSqlite.sqlite) {
    const databasePath = resolveDatabasePath();
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });

    const db = new Database(databasePath);
    initializeDatabase(db);

    globalForSqlite.sqlite = db;
  }

  return globalForSqlite.sqlite;
}
