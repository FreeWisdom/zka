import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach } from 'vitest';

const testDatabasePath = path.resolve(process.cwd(), 'data', 'platform-b.test.db');

if (fs.existsSync(testDatabasePath)) {
  fs.rmSync(testDatabasePath, { force: true });
}

beforeEach(() => {
  process.env.DATABASE_PROVIDER = 'sqlite';
  process.env.DATABASE_PATH = testDatabasePath;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.MIGRATION_DATABASE_URL;
  delete process.env.POSTGRES_URL_NON_POOLING;
  process.env.ADMIN_PASSWORD = 'test-admin-password';
  process.env.CARD_ENCRYPTION_KEY = 'test-card-encryption-key';
});
