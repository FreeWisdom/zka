import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';

import { getDatabase } from '@/lib/storage/database';

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

function encodeUpstreamCode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function hashUpstreamCode(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function createFixtureCode(
  product: Product,
  input: {
    code: string;
    redeemStatus: string;
    upstreamStatus: string;
    rawUpstreamCode: string;
  },
) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const upstreamCodeId = randomUUID();

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
    product.id,
    encodeUpstreamCode(input.rawUpstreamCode),
    hashUpstreamCode(input.rawUpstreamCode),
    input.upstreamStatus,
    now,
    now,
  );

  db.prepare(
    `
      INSERT INTO redeem_codes (
        id,
        code,
        product_id,
        upstream_code_id,
        status,
        issued_at,
        submitted_at,
        redeemed_at,
        locked_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    randomUUID(),
    input.code,
    product.id,
    upstreamCodeId,
    input.redeemStatus,
    now,
    input.redeemStatus === 'submitted' ? now : null,
    input.redeemStatus === 'success' ? now : null,
    input.redeemStatus === 'locked' ? now : null,
    now,
  );
}

export async function resetDatabase() {
  const db = getDatabase();

  db.exec(`
    DELETE FROM redeem_requests;
    DELETE FROM redeem_codes;
    DELETE FROM upstream_codes;
    DELETE FROM products;
  `);
}

export async function seedRedeemFixtures() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const product = {
    id: randomUUID(),
    name: 'ChatGPT Plus 月卡',
    slug: 'chatgpt-plus-1m',
    description: '平台 B 测试商品',
  };

  db.prepare(
    `
      INSERT INTO products (id, name, slug, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(product.id, product.name, product.slug, product.description, now, now);

  await Promise.all([
    createFixtureCode(product, {
      code: 'GIFT-VALID-0001',
      redeemStatus: 'unused',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-SUCCESS-0001',
    }),
    createFixtureCode(product, {
      code: 'GIFT-RETRY-0001',
      redeemStatus: 'failed',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-RETRY-0001',
    }),
    createFixtureCode(product, {
      code: 'GIFT-PROCESS-0001',
      redeemStatus: 'unused',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-PROCESS-0001',
    }),
    createFixtureCode(product, {
      code: 'GIFT-LOCKED-0001',
      redeemStatus: 'locked',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-LOCKED-0001',
    }),
    createFixtureCode(product, {
      code: 'GIFT-USED-0001',
      redeemStatus: 'success',
      upstreamStatus: 'success',
      rawUpstreamCode: 'UPSTREAM-USED-0001',
    }),
    createFixtureCode(product, {
      code: 'GIFT-BROKEN-0001',
      redeemStatus: 'failed',
      upstreamStatus: 'invalid',
      rawUpstreamCode: 'UPSTREAM-INVALID-0001',
    }),
  ]);

  return { product };
}
