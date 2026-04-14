import './load-env';

import { closeDatabaseConnections, getDatabase } from '@/lib/storage/database';
import { hashUpstreamCode } from '@/lib/redeem/upstream-code';

const DEMO_REDEEM_CODES = [
  'GIFT-VALID-0001',
  'GIFT-RETRY-0001',
  'GIFT-PROCESS-0001',
  'GIFT-LOCKED-0001',
  'GIFT-BROKEN-0001',
] as const;

const DEMO_UPSTREAM_CODES = [
  'UPSTREAM-SUCCESS-0001',
  'UPSTREAM-RETRY-0001',
  'UPSTREAM-PROCESS-0001',
  'UPSTREAM-LOCKED-0001',
  'UPSTREAM-INVALID-0001',
] as const;

const DEMO_UPSTREAM_HASHES = DEMO_UPSTREAM_CODES.map((code) => hashUpstreamCode(code));

type UpstreamRow = {
  id: string;
  productId: string;
  status: string;
};

type RedeemRow = {
  id: string;
  code: string;
  status: string;
  upstreamCodeId: string;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
};

function buildPlaceholders(length: number) {
  return Array.from({ length }, () => '?').join(', ');
}

async function main() {
  const db = getDatabase();
  const upstreamPlaceholders = buildPlaceholders(DEMO_UPSTREAM_HASHES.length);
  const redeemPlaceholders = buildPlaceholders(DEMO_REDEEM_CODES.length);

  const upstreamRows = await db
    .prepare<string[], UpstreamRow>(
      `
        SELECT
          id,
          product_id AS productId,
          status
        FROM upstream_codes
        WHERE upstream_code_hash IN (${upstreamPlaceholders})
      `,
    )
    .all(...DEMO_UPSTREAM_HASHES);

  const redeemRows = await db
    .prepare<string[], RedeemRow>(
      `
        SELECT
          id,
          code,
          status,
          upstream_code_id AS upstreamCodeId
        FROM redeem_codes
        WHERE code IN (${redeemPlaceholders})
      `,
    )
    .all(...DEMO_REDEEM_CODES);

  const targetedProductIds = Array.from(
    new Set(upstreamRows.map((row) => row.productId)),
  );

  console.log(
    JSON.stringify(
      {
        matchedUpstreamCodes: upstreamRows.length,
        matchedRedeemCodes: redeemRows.length,
        matchedProductIds: targetedProductIds.length,
        redeemCodes: redeemRows.map((row) => row.code),
      },
      null,
      2,
    ),
  );

  if (!upstreamRows.length && !redeemRows.length) {
    console.log('No demo data found. Nothing to clean.');
    return;
  }

  const upstreamIds = upstreamRows.map((row) => row.id);
  const redeemIds = redeemRows.map((row) => row.id);

  await db.transaction(async () => {
    if (redeemIds.length) {
      await db
        .prepare(
          `
            DELETE FROM redeem_requests
            WHERE redeem_code_id IN (${buildPlaceholders(redeemIds.length)})
          `,
        )
        .run(...redeemIds);

      await db
        .prepare(
          `
            DELETE FROM redeem_codes
            WHERE id IN (${buildPlaceholders(redeemIds.length)})
          `,
        )
        .run(...redeemIds);
    }

    if (upstreamIds.length) {
      await db
        .prepare(
          `
            DELETE FROM upstream_codes
            WHERE id IN (${buildPlaceholders(upstreamIds.length)})
          `,
        )
        .run(...upstreamIds);
    }

    for (const productId of targetedProductIds) {
      await db
        .prepare(
          `
            DELETE FROM products
            WHERE id = ?
              AND NOT EXISTS (
                SELECT 1
                FROM upstream_codes
                WHERE product_id = ?
              )
              AND NOT EXISTS (
                SELECT 1
                FROM redeem_codes
                WHERE product_id = ?
              )
              AND NOT EXISTS (
                SELECT 1
                FROM inventory_batches
                WHERE product_id = ?
              )
          `,
        )
        .run(productId, productId, productId, productId);
    }
  })();

  const remainingDemoRedeemRows = await db
    .prepare<string[], RedeemRow>(
      `
        SELECT
          id,
          code,
          status,
          upstream_code_id AS upstreamCodeId
        FROM redeem_codes
        WHERE code IN (${redeemPlaceholders})
      `,
    )
    .all(...DEMO_REDEEM_CODES);

  const remainingDemoUpstreamRows = await db
    .prepare<string[], UpstreamRow>(
      `
        SELECT
          id,
          product_id AS productId,
          status
        FROM upstream_codes
        WHERE upstream_code_hash IN (${upstreamPlaceholders})
      `,
    )
    .all(...DEMO_UPSTREAM_HASHES);

  const remainingProducts = targetedProductIds.length
    ? await db
        .prepare<string[], ProductRow>(
          `
            SELECT id, name, slug
            FROM products
            WHERE id IN (${buildPlaceholders(targetedProductIds.length)})
          `,
        )
        .all(...targetedProductIds)
    : [];

  console.log(
    JSON.stringify(
      {
        removedUpstreamCodes: upstreamRows.length - remainingDemoUpstreamRows.length,
        removedRedeemCodes: redeemRows.length - remainingDemoRedeemRows.length,
        remainingDemoUpstreamCodes: remainingDemoUpstreamRows.length,
        remainingDemoRedeemCodes: remainingDemoRedeemRows.length,
        remainingTargetProducts: remainingProducts,
      },
      null,
      2,
    ),
  );
}

void main().finally(async () => {
  await closeDatabaseConnections();
});
