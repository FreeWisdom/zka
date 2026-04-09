import { randomBytes, randomUUID } from 'node:crypto';

import { getDatabase } from '@/lib/storage/database';

export const DEFAULT_PRODUCT_NAME = 'ChatGPT Plus 月卡';
export const DEFAULT_PRODUCT_SLUG = 'chatgpt-plus-1m';
export const DEFAULT_PRODUCT_DESCRIPTION = '自动映射上游卡密生成的内部兑换码';

const REDEEM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type ProductInput = {
  productName?: string;
  productSlug?: string;
  productDescription?: string;
};

export type ProductRow = {
  id: string;
  name: string;
  slug: string;
};

function randomSegment(length: number) {
  return Array.from(randomBytes(length), (value) =>
    REDEEM_CODE_ALPHABET[value % REDEEM_CODE_ALPHABET.length],
  ).join('');
}

function createRedeemCodeCandidate() {
  return `GIFT-${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

export function ensureProduct(input: ProductInput): ProductRow {
  const db = getDatabase();
  const slug = input.productSlug?.trim() || DEFAULT_PRODUCT_SLUG;
  const now = new Date().toISOString();
  const existingProduct = db
    .prepare<
      [string],
      ProductRow
    >(
      `
        SELECT id, name, slug
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
    slug: product.slug,
  };
}

export function createRedeemCodeForUpstream(input: {
  productId: string;
  upstreamCodeId: string;
  now?: string;
}) {
  const db = getDatabase();
  const now = input.now ?? new Date().toISOString();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const redeemCode = createRedeemCodeCandidate();

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
        randomUUID(),
        redeemCode,
        input.productId,
        input.upstreamCodeId,
        'unused',
        now,
        now,
      );

      return redeemCode;
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      if (error.message.includes('UNIQUE constraint failed: redeem_codes.code')) {
        continue;
      }

      if (error.message.includes('UNIQUE constraint failed: redeem_codes.upstream_code_id')) {
        const existingPair = db
          .prepare<
            [string],
            { code: string }
          >(
            `
              SELECT code
              FROM redeem_codes
              WHERE upstream_code_id = ?
            `,
          )
          .get(input.upstreamCodeId);

        if (existingPair) {
          return existingPair.code;
        }
      }

      throw error;
    }
  }

  throw new Error('生成内部兑换码失败，请稍后重试');
}
