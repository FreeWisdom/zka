import './load-env';

import { randomUUID } from 'node:crypto';

import { encodeUpstreamCode, hashUpstreamCode } from '@/lib/redeem/upstream-code';
import { closeDatabaseConnections, getDatabase } from '@/lib/storage/database';

async function insertFixtureCode(input: {
  productId: string;
  code: string;
  redeemStatus: string;
  upstreamStatus: string;
  rawUpstreamCode: string;
}) {
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
    input.productId,
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
    input.productId,
    upstreamCodeId,
    input.redeemStatus,
    now,
    input.redeemStatus === 'submitted' ? now : null,
    input.redeemStatus === 'success' ? now : null,
    input.redeemStatus === 'locked' ? now : null,
    now,
  );
}

async function main() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const product = {
    id: randomUUID(),
    name: 'ChatGPT Plus 月卡',
    slug: 'chatgpt-plus-1m',
    description: 'zka 测试商品',
  };

  await db.exec(`
    DELETE FROM redeem_requests;
    DELETE FROM redeem_codes;
    DELETE FROM upstream_codes;
    DELETE FROM inventory_batches;
    DELETE FROM products;
  `);

  await db.prepare(
    `
      INSERT INTO products (id, name, slug, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(product.id, product.name, product.slug, product.description, now, now);

  for (const fixture of [
    {
      code: 'GIFT-VALID-0001',
      redeemStatus: 'unused',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-SUCCESS-0001',
    },
    {
      code: 'GIFT-RETRY-0001',
      redeemStatus: 'failed',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-RETRY-0001',
    },
    {
      code: 'GIFT-PROCESS-0001',
      redeemStatus: 'unused',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-PROCESS-0001',
    },
    {
      code: 'GIFT-LOCKED-0001',
      redeemStatus: 'locked',
      upstreamStatus: 'bound',
      rawUpstreamCode: 'UPSTREAM-LOCKED-0001',
    },
    {
      code: 'GIFT-BROKEN-0001',
      redeemStatus: 'failed',
      upstreamStatus: 'invalid',
      rawUpstreamCode: 'UPSTREAM-INVALID-0001',
    },
  ]) {
    await insertFixtureCode({
      productId: product.id,
      ...fixture,
    });
  }

  console.log('Available demo codes:');
  console.log('- GIFT-VALID-0001 => success');
  console.log('- GIFT-RETRY-0001 => retryable failure');
  console.log('- GIFT-PROCESS-0001 => processing');
  console.log('- GIFT-LOCKED-0001 => locked');
  console.log('- GIFT-BROKEN-0001 => invalid upstream');
}

void main().finally(async () => {
  await closeDatabaseConnections();
});
