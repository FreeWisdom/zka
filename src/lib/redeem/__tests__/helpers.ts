import { randomUUID } from 'node:crypto';

import { encodeUpstreamCode, hashUpstreamCode } from '@/lib/redeem/upstream-code';
import { getDatabase } from '@/lib/storage/database';

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

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

  await db.prepare(
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

  await db.prepare(
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

  await db.exec(`
    DELETE FROM redeem_requests;
    DELETE FROM redeem_codes;
    DELETE FROM upstream_codes;
    DELETE FROM inventory_batches;
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
    description: 'zka 测试商品',
  };

  await db.prepare(
    `
      INSERT INTO products (id, name, slug, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(product.id, product.name, product.slug, product.description, now, now);

  await Promise.all([
    createFixtureCode(product, {
      code: 'ZKA-VALID-0001',
      redeemStatus: 'unused',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-SUCCESS-0001',
    }),
    createFixtureCode(product, {
      code: 'ZKA-RETRY-0001',
      redeemStatus: 'failed',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-RETRY-0001',
    }),
    createFixtureCode(product, {
      code: 'ZKA-PROCESS-0001',
      redeemStatus: 'unused',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-PROCESS-0001',
    }),
    createFixtureCode(product, {
      code: 'ZKA-LOCKED-0001',
      redeemStatus: 'locked',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-LOCKED-0001',
    }),
    createFixtureCode(product, {
      code: 'ZKA-USED-0001',
      redeemStatus: 'success',
      upstreamStatus: 'success',
      rawUpstreamCode: 'UPSTREAM-USED-0001',
    }),
    createFixtureCode(product, {
      code: 'ZKA-BROKEN-0001',
      redeemStatus: 'failed',
      upstreamStatus: 'invalid',
      rawUpstreamCode: 'UPSTREAM-INVALID-0001',
    }),
  ]);

  return { product };
}
