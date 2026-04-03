import '@testing-library/jest-dom/vitest';
import fs from 'node:fs';
import path from 'node:path';

const testDatabasePath = path.resolve(process.cwd(), 'data', 'platform-b.test.db');

process.env.DATABASE_PATH = testDatabasePath;

if (fs.existsSync(testDatabasePath)) {
  fs.rmSync(testDatabasePath, { force: true });
}
