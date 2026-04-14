import { randomUUID } from 'node:crypto';

import { getDatabase } from '@/lib/storage/database';

import { lookupBoundUpstreamCode } from './upstream-adapter';
import type { PairRedeemCodeInput, PairRedeemCodeResult } from './types';
import { createRedeemCodeForUpstream, ensureProduct } from './code-pairing';
import {
  encodeUpstreamCode,
  hashUpstreamCode,
  normalizeUpstreamCode,
} from './upstream-code';

type ExistingUpstreamRow = {
  upstreamCodeId: string;
  productId: string;
  code: string | null;
  productName: string;
  upstreamCodeEncrypted: string;
};

async function findExistingPair(
  upstreamCodeHash: string,
): Promise<ExistingUpstreamRow | undefined> {
  const db = getDatabase();

  return db
    .prepare<
      [string],
      ExistingUpstreamRow
    >(
      `
        SELECT
          uc.id AS upstreamCodeId,
          uc.product_id AS productId,
          rc.code AS code,
          p.name AS productName,
          uc.upstream_code_encrypted AS upstreamCodeEncrypted
        FROM upstream_codes uc
        INNER JOIN products p ON p.id = uc.product_id
        LEFT JOIN redeem_codes rc ON rc.upstream_code_id = uc.id
        WHERE uc.upstream_code_hash = ?
      `,
    )
    .get(upstreamCodeHash);
}

async function insertNewPair(input: PairRedeemCodeInput) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const normalizedUpstreamCode = normalizeUpstreamCode(input.upstreamCode);
  const product = await ensureProduct(input);
  const upstreamCodeId = randomUUID();
  let redeemCode = '';

  const transaction = db.transaction(async () => {
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
      encodeUpstreamCode(normalizedUpstreamCode),
      hashUpstreamCode(normalizedUpstreamCode),
      'bound',
      now,
      now,
    );

    redeemCode = await createRedeemCodeForUpstream({
      productId: product.id,
      upstreamCodeId,
      now,
    });
  });

  await transaction();

  return {
    code: redeemCode,
    productName: product.name,
    upstreamCodeEncrypted: encodeUpstreamCode(normalizedUpstreamCode),
  };
}

export async function pairRedeemCode(
  input: PairRedeemCodeInput,
): Promise<PairRedeemCodeResult> {
  const normalizedUpstreamCode = normalizeUpstreamCode(input.upstreamCode);
  const existingPair = await findExistingPair(hashUpstreamCode(normalizedUpstreamCode));

  if (existingPair?.code) {
    const upstreamLookup = await lookupBoundUpstreamCode({
      upstreamCodeEncrypted: existingPair.upstreamCodeEncrypted,
    });

    return {
      code: existingPair.code,
      created: false,
      productName: existingPair.productName,
      upstreamCodeMasked: upstreamLookup.codeMasked,
      upstreamLookup,
    };
  }

  if (existingPair) {
    const db = getDatabase();
    const now = new Date().toISOString();
    const code = await db.transaction(async () => {
      const redeemCode = await createRedeemCodeForUpstream({
        productId: existingPair.productId,
        upstreamCodeId: existingPair.upstreamCodeId,
        now,
      });

      await db.prepare(
        `
          UPDATE upstream_codes
          SET status = ?, updated_at = ?
          WHERE id = ?
        `,
      ).run('bound', now, existingPair.upstreamCodeId);

      return redeemCode;
    })();
    const upstreamLookup = await lookupBoundUpstreamCode({
      upstreamCodeEncrypted: existingPair.upstreamCodeEncrypted,
    });

    return {
      code,
      created: true,
      productName: existingPair.productName,
      upstreamCodeMasked: upstreamLookup.codeMasked,
      upstreamLookup,
    };
  }

  const createdPair = await insertNewPair({
    ...input,
    upstreamCode: normalizedUpstreamCode,
  });
  const upstreamLookup = await lookupBoundUpstreamCode({
    upstreamCodeEncrypted: createdPair.upstreamCodeEncrypted,
  });

  return {
    code: createdPair.code,
    created: true,
    productName: createdPair.productName,
    upstreamCodeMasked: upstreamLookup.codeMasked,
    upstreamLookup,
  };
}
