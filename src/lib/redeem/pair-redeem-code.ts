import { randomBytes, randomUUID } from 'node:crypto';

import { getDatabase } from '@/lib/storage/database';

import { lookupBoundUpstreamCode } from './upstream-adapter';
import type { PairRedeemCodeInput, PairRedeemCodeResult } from './types';
import {
  encodeUpstreamCode,
  hashUpstreamCode,
  normalizeUpstreamCode,
} from './upstream-code';

const DEFAULT_PRODUCT_NAME = 'ChatGPT Plus 月卡';
const DEFAULT_PRODUCT_SLUG = 'chatgpt-plus-1m';
const DEFAULT_PRODUCT_DESCRIPTION = '自动映射上游卡密生成的内部兑换码';
const REDEEM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type ProductRow = {
  id: string;
  name: string;
};

type ExistingPairRow = {
  code: string;
  productName: string;
  upstreamCodeEncrypted: string;
};

function randomSegment(length: number) {
  return Array.from(randomBytes(length), (value) =>
    REDEEM_CODE_ALPHABET[value % REDEEM_CODE_ALPHABET.length],
  ).join('');
}

function createRedeemCodeCandidate() {
  return `GIFT-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

function findExistingPair(upstreamCodeHash: string) {
  const db = getDatabase();

  return db
    .prepare<
      [string],
      ExistingPairRow
    >(
      `
        SELECT
          rc.code AS code,
          p.name AS productName,
          uc.upstream_code_encrypted AS upstreamCodeEncrypted
        FROM upstream_codes uc
        INNER JOIN redeem_codes rc ON rc.upstream_code_id = uc.id
        INNER JOIN products p ON p.id = rc.product_id
        WHERE uc.upstream_code_hash = ?
      `,
    )
    .get(upstreamCodeHash);
}

function ensureProduct(input: PairRedeemCodeInput): ProductRow {
  const db = getDatabase();
  const slug = input.productSlug?.trim() || DEFAULT_PRODUCT_SLUG;
  const now = new Date().toISOString();
  const existingProduct = db
    .prepare<
      [string],
      ProductRow
    >(
      `
        SELECT id, name
        FROM products
        WHERE slug = ?
      `,
    )
    .get(slug);

  if (existingProduct) {
    return existingProduct;
  }

  const product = {
    id: randomUUID(),
    name: input.productName?.trim() || DEFAULT_PRODUCT_NAME,
    slug,
    description: input.productDescription?.trim() || DEFAULT_PRODUCT_DESCRIPTION,
  };

  db.prepare(
    `
      INSERT INTO products (id, name, slug, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(product.id, product.name, product.slug, product.description, now, now);

  return {
    id: product.id,
    name: product.name,
  };
}

function insertNewPair(input: PairRedeemCodeInput) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const normalizedUpstreamCode = normalizeUpstreamCode(input.upstreamCode);
  const product = ensureProduct(input);
  const upstreamCodeId = randomUUID();
  const redeemCodeId = randomUUID();
  let redeemCode = '';

  const transaction = db.transaction(() => {
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
      encodeUpstreamCode(normalizedUpstreamCode),
      hashUpstreamCode(normalizedUpstreamCode),
      'bound',
      now,
      now,
    );

    for (let attempt = 0; attempt < 8; attempt += 1) {
      redeemCode = createRedeemCodeCandidate();

      try {
        db.prepare(
          `
            INSERT INTO redeem_codes (
              id,
              code,
              product_id,
              upstream_code_id,
              status,
              issued_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          redeemCodeId,
          redeemCode,
          product.id,
          upstreamCodeId,
          'unused',
          now,
          now,
        );

        return;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes('UNIQUE constraint failed: redeem_codes.code')
        ) {
          throw error;
        }
      }
    }

    throw new Error('生成内部兑换码失败，请稍后重试');
  });

  transaction();

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
  const existingPair = findExistingPair(hashUpstreamCode(normalizedUpstreamCode));

  if (existingPair) {
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

  const createdPair = insertNewPair({
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
