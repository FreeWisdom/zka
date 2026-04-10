import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  decodeUpstreamCode,
  encodeUpstreamCode,
  hashUpstreamCode,
  isEncryptedUpstreamCode,
  migrateLegacyUpstreamCodeStorage,
} from '@/lib/redeem/upstream-code';
import { getDatabase } from '@/lib/storage/database';

import { resetDatabase } from './helpers';

describe('upstream code storage', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('encrypts and decrypts upstream codes', () => {
    const encrypted = encodeUpstreamCode('REAL-UPSTREAM-0001');

    expect(isEncryptedUpstreamCode(encrypted)).toBe(true);
    expect(encrypted).not.toContain('REAL-UPSTREAM-0001');
    expect(decodeUpstreamCode(encrypted)).toBe('REAL-UPSTREAM-0001');
  });

  it('migrates legacy base64 rows into encrypted storage', () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    const productId = randomUUID();
    const upstreamCodeId = randomUUID();
    const legacyEncoded = Buffer.from('LEGACY-UPSTREAM-0001', 'utf8').toString('base64');

    db.prepare(
      `
        INSERT INTO products (id, name, slug, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(productId, 'ChatGPT Plus 月卡', 'chatgpt-plus-1m', 'test product', now, now);

    db.prepare(
      `
        INSERT INTO upstream_codes (
          id,
          product_id,
          upstream_code_encrypted,
          upstream_code_hash,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      upstreamCodeId,
      productId,
      legacyEncoded,
      hashUpstreamCode('LEGACY-UPSTREAM-0001'),
      'bound',
      now,
      now,
    );

    migrateLegacyUpstreamCodeStorage(db);

    const row = db
      .prepare<[string], { upstream_code_encrypted: string }>(
        `
          SELECT upstream_code_encrypted
          FROM upstream_codes
          WHERE id = ?
        `,
      )
      .get(upstreamCodeId);

    expect(row).toBeDefined();
    expect(row && isEncryptedUpstreamCode(row.upstream_code_encrypted)).toBe(true);
    expect(row && decodeUpstreamCode(row.upstream_code_encrypted)).toBe('LEGACY-UPSTREAM-0001');
  });
});
