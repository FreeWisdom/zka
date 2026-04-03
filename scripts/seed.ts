import { createHash, randomUUID } from 'node:crypto';

import { getDatabase } from '../src/lib/storage/database';

function encodeUpstreamCode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function hashUpstreamCode(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function insertFixtureCode(input: {
  productId: string;
  code: string;
  redeemStatus: string;
  upstreamStatus: string;
  rawUpstreamCode: string;
}) {
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
    input.productId,
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

function main() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const productId = randomUUID();

  db.exec(`
    DELETE FROM redeem_requests;
    DELETE FROM redeem_codes;
    DELETE FROM upstream_codes;
    DELETE FROM products;
  `);

  db.prepare(
    `
      INSERT INTO products (id, name, slug, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    productId,
    'ChatGPT Plus 月卡',
    'chatgpt-plus-1m',
    '平台 B 本地调试示例商品',
    now,
    now,
  );

  [
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
  ].forEach((fixture) =>
    insertFixtureCode({
      ...fixture,
      productId,
    }),
  );

  console.log('Seed complete.');
  console.log('Available demo codes:');
  console.log('- GIFT-VALID-0001 => success');
  console.log('- GIFT-RETRY-0001 => retryable failure');
  console.log('- GIFT-PROCESS-0001 => processing');
  console.log('- GIFT-LOCKED-0001 => locked');
  console.log('- GIFT-BROKEN-0001 => invalid upstream');
}

main();
