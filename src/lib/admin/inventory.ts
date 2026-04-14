import { randomBytes, randomUUID } from 'node:crypto';

import {
  createRedeemCodeForUpstream,
  ensureProduct,
} from '@/lib/redeem/code-pairing';
import { parseInventoryCodesText } from '@/lib/admin/inventory-import-parser';
import {
  decodeUpstreamCode,
  encodeUpstreamCode,
  hashUpstreamCode,
  maskStoredUpstreamCode,
  maskUpstreamCode,
} from '@/lib/redeem/upstream-code';
import { getDatabase } from '@/lib/storage/database';

type ExistingInventoryRow = {
  upstreamCodeId: string;
  productId: string;
  upstreamCodeEncrypted: string;
  redeemCode: string | null;
};

export class InventoryImportError extends Error {}

export type ImportInventoryInput = {
  codesText: string;
  productName?: string;
  productSlug?: string;
  productDescription?: string;
  supplierName?: string;
  remark?: string;
  generateRedeemCodes?: boolean;
};

export type ImportInventoryItem = {
  upstreamCodeMasked: string;
  redeemCode: string | null;
  status: 'generated' | 'imported' | 'paired_existing' | 'existing';
  message: string;
};

export type ImportInventoryResult = {
  batchNo: string | null;
  productName: string;
  generateRedeemCodes: boolean;
  receivedCount: number;
  uniqueCount: number;
  duplicateInputCount: number;
  importedCount: number;
  existingCount: number;
  generatedCount: number;
  items: ImportInventoryItem[];
};

export type InventoryListItem = {
  upstreamCodeId: string;
  batchNo: string | null;
  productName: string;
  upstreamCodeMasked: string;
  upstreamStatus: string;
  redeemCode: string | null;
  redeemStatus: string | null;
  createdAt: string;
};

export type InventoryExportResult = {
  filename: string;
  csv: string;
  itemCount: number;
};

export type BatchListItem = {
  batchNo: string;
  productName: string;
  supplierName: string | null;
  remark: string | null;
  quantity: number;
  generatedCount: number;
  inStockCount: number;
  createdAt: string;
};

type ListInventoryOptions = {
  batchNo?: string | null;
  limit?: number | null;
  hasRedeemCode?: boolean;
};

type InventoryListRow = {
  upstreamCodeId: string;
  batchNo: string | null;
  productName: string;
  upstreamCodeEncrypted: string;
  upstreamStatus: string;
  redeemCode: string | null;
  redeemStatus: string | null;
  createdAt: string;
};

type BatchListRow = {
  batchNo: string;
  productName: string;
  supplierName: string | null;
  remark: string | null;
  quantity: number;
  generatedCount: number;
  inStockCount: number;
  createdAt: string;
};

type UpstreamCodeDetailRow = {
  upstreamCodeEncrypted: string;
};

function createBatchNo() {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const suffix = randomBytes(2).toString('hex').toUpperCase();

  return `BATCH-${timestamp}-${suffix}`;
}

function normalizeBatchNo(value?: string | null) {
  return value?.trim() || null;
}

function escapeCsvField(value: string | null) {
  const normalizedValue = value ?? '';

  if (/[",\r\n]/.test(normalizedValue)) {
    return `"${normalizedValue.replace(/"/g, '""')}"`;
  }

  return normalizedValue;
}

function createInventoryExportFilename(batchNo?: string | null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const normalizedBatchNo = normalizeBatchNo(batchNo);
  const safeBatchNo = normalizedBatchNo?.replace(/[^A-Z0-9_-]+/gi, '-');

  return safeBatchNo
    ? `zka-inventory-${safeBatchNo}-${timestamp}.csv`
    : `zka-inventory-${timestamp}.csv`;
}

function isDeliverableInventoryItem(item: InventoryListItem) {
  return Boolean(
    item.redeemCode && item.redeemStatus === 'unused' && item.upstreamStatus === 'bound',
  );
}

async function findExistingInventory(hash: string) {
  const db = getDatabase();

  return db
    .prepare<
      [string],
      ExistingInventoryRow
    >(
      `
        SELECT
          uc.id AS upstreamCodeId,
          uc.product_id AS productId,
          uc.upstream_code_encrypted AS upstreamCodeEncrypted,
          rc.code AS redeemCode
        FROM upstream_codes uc
        LEFT JOIN redeem_codes rc ON rc.upstream_code_id = uc.id
        WHERE uc.upstream_code_hash = ?
      `,
    )
    .get(hash);
}

export async function importInventoryBatch(
  input: ImportInventoryInput,
): Promise<ImportInventoryResult> {
  const parsed = parseInventoryCodesText(input.codesText);

  if (parsed.codes.length === 0) {
    throw new InventoryImportError('未解析到可导入的上游卡密');
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const product = await ensureProduct(input);
  const batchId = randomUUID();
  const batchNo = createBatchNo();
  const generateRedeemCodes = input.generateRedeemCodes ?? true;
  const result: ImportInventoryResult = {
    batchNo: null,
    productName: product.name,
    generateRedeemCodes,
    receivedCount: parsed.receivedCount,
    uniqueCount: parsed.codes.length,
    duplicateInputCount: parsed.duplicateInputCount,
    importedCount: 0,
    existingCount: 0,
    generatedCount: 0,
    items: [],
  };

  const supplierName = input.supplierName?.trim() || null;
  const remark = input.remark?.trim() || null;

  await db.transaction(async () => {
    const ensureBatchCreated = async () => {
      if (result.batchNo) {
        return;
      }

      await db.prepare(
        `
          INSERT INTO inventory_batches (
            id,
            batch_no,
            supplier_name,
            product_id,
            remark,
            quantity,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(batchId, batchNo, supplierName, product.id, remark, 0, now);

      result.batchNo = batchNo;
    };

    for (const upstreamCode of parsed.codes) {
      const upstreamCodeHash = hashUpstreamCode(upstreamCode);
      const existingInventory = await findExistingInventory(upstreamCodeHash);

      if (existingInventory?.redeemCode) {
        result.existingCount += 1;
        result.items.push({
          upstreamCodeMasked: maskStoredUpstreamCode(existingInventory.upstreamCodeEncrypted),
          redeemCode: existingInventory.redeemCode,
          status: 'existing',
          message: '已存在绑定关系，沿用原内部卡密',
        });
        continue;
      }

      if (existingInventory && generateRedeemCodes) {
        const redeemCode = await createRedeemCodeForUpstream({
          productId: existingInventory.productId,
          upstreamCodeId: existingInventory.upstreamCodeId,
          now,
        });

        await db.prepare(
          `
            UPDATE upstream_codes
            SET status = ?, updated_at = ?
            WHERE id = ?
          `,
        ).run('bound', now, existingInventory.upstreamCodeId);

        result.existingCount += 1;
        result.generatedCount += 1;
        result.items.push({
          upstreamCodeMasked: maskUpstreamCode(upstreamCode),
          redeemCode,
          status: 'paired_existing',
          message: '已为历史库存生成新的内部卡密',
        });
        continue;
      }

      if (existingInventory) {
        result.existingCount += 1;
        result.items.push({
          upstreamCodeMasked: maskStoredUpstreamCode(existingInventory.upstreamCodeEncrypted),
          redeemCode: null,
          status: 'existing',
          message: '库存已存在，本次未重复导入',
        });
        continue;
      }

      const upstreamCodeId = randomUUID();
      const upstreamStatus = generateRedeemCodes ? 'bound' : 'in_stock';

      await ensureBatchCreated();

      await db.prepare(
        `
          INSERT INTO upstream_codes (
            id,
            product_id,
            batch_id,
            upstream_code_encrypted,
            upstream_code_hash,
            status,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        upstreamCodeId,
        product.id,
        batchId,
        encodeUpstreamCode(upstreamCode),
        upstreamCodeHash,
        upstreamStatus,
        now,
        now,
      );

      let redeemCode: string | null = null;

      if (generateRedeemCodes) {
        redeemCode = await createRedeemCodeForUpstream({
          productId: product.id,
          upstreamCodeId,
          now,
        });
        result.generatedCount += 1;
      }

      result.importedCount += 1;
      result.items.push({
        upstreamCodeMasked: maskUpstreamCode(upstreamCode),
        redeemCode,
        status: redeemCode ? 'generated' : 'imported',
        message: redeemCode ? '已导入并生成内部卡密' : '已导入库存，暂未生成内部卡密',
      });
    }

    if (result.batchNo) {
      await db.prepare(
        `
          UPDATE inventory_batches
          SET quantity = ?
          WHERE id = ?
        `,
      ).run(result.importedCount, batchId);
    }
  })();

  return result;
}

export async function listInventoryItems(
  input: ListInventoryOptions = {},
): Promise<InventoryListItem[]> {
  const db = getDatabase();
  const batchNo = normalizeBatchNo(input.batchNo);
  const limit = input.limit ?? 500;
  const params: Array<string | number> = [];
  const whereClauses: string[] = [];

  if (batchNo) {
    whereClauses.push('ib.batch_no = ?');
    params.push(batchNo);
  }

  if (input.hasRedeemCode) {
    whereClauses.push('rc.code IS NOT NULL');
  }

  const baseQuery = `
    SELECT
      uc.id AS upstreamCodeId,
      ib.batch_no AS batchNo,
      p.name AS productName,
      uc.upstream_code_encrypted AS upstreamCodeEncrypted,
      uc.status AS upstreamStatus,
      rc.code AS redeemCode,
      rc.status AS redeemStatus,
      uc.created_at AS createdAt
    FROM upstream_codes uc
    INNER JOIN products p ON p.id = uc.product_id
    LEFT JOIN inventory_batches ib ON ib.id = uc.batch_id
    LEFT JOIN redeem_codes rc ON rc.upstream_code_id = uc.id
    ${whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''}
    ORDER BY uc.created_at DESC
  `;
  const rows =
    limit == null
      ? await db
          .prepare<Array<string | number>, InventoryListRow>(baseQuery)
          .all(...params)
      : await db
          .prepare<Array<string | number>, InventoryListRow>(
            `${baseQuery}\nLIMIT ?`,
          )
          .all(...params, limit);

  return rows.map((row) => ({
    upstreamCodeId: row.upstreamCodeId,
    batchNo: row.batchNo,
    productName: row.productName,
    upstreamCodeMasked: maskStoredUpstreamCode(row.upstreamCodeEncrypted),
    upstreamStatus: row.upstreamStatus,
    redeemCode: row.redeemCode,
    redeemStatus: row.redeemStatus,
    createdAt: row.createdAt,
  }));
}

export async function revealInventoryUpstreamCode(upstreamCodeId: string) {
  const normalizedId = upstreamCodeId.trim();

  if (!normalizedId) {
    throw new InventoryImportError('缺少上游卡密记录 ID');
  }

  const db = getDatabase();
  const row = await db
    .prepare<[string], UpstreamCodeDetailRow>(
      `
        SELECT upstream_code_encrypted AS upstreamCodeEncrypted
        FROM upstream_codes
        WHERE id = ?
      `,
    )
    .get(normalizedId);

  if (!row) {
    throw new InventoryImportError('未找到对应的上游卡密记录');
  }

  try {
    return decodeUpstreamCode(row.upstreamCodeEncrypted);
  } catch {
    throw new InventoryImportError(
      '当前上游卡密无法解密，请确认部署环境中的 CARD_ENCRYPTION_KEY 与写入数据库时使用的值一致',
    );
  }
}

export async function exportInventoryItems(
  input: ListInventoryOptions = {},
): Promise<InventoryExportResult> {
  const items = await listInventoryItems({
    ...input,
    limit: input.limit ?? null,
    hasRedeemCode: true,
  });
  const lines = [
    [
      'batchNo',
      'productName',
      'upstreamCodeMasked',
      'redeemCode',
      'redeemStatus',
      'upstreamStatus',
      'deliverable',
      'createdAt',
    ].join(','),
    ...items.map((item) =>
      [
        item.batchNo ?? 'historical',
        item.productName,
        item.upstreamCodeMasked,
        item.redeemCode,
        item.redeemStatus ?? '',
        item.upstreamStatus,
        isDeliverableInventoryItem(item) ? 'yes' : 'no',
        item.createdAt,
      ]
        .map(escapeCsvField)
        .join(','),
    ),
  ];

  return {
    filename: createInventoryExportFilename(input.batchNo),
    csv: lines.join('\n'),
    itemCount: items.length,
  };
}

export async function listInventoryBatches(limit = 24): Promise<BatchListItem[]> {
  const db = getDatabase();

  const rows = await db
    .prepare<
      [number],
      BatchListRow
    >(
      `
        SELECT
          ib.batch_no AS batchNo,
          p.name AS productName,
          ib.supplier_name AS supplierName,
          ib.remark AS remark,
          ib.quantity AS quantity,
          COALESCE(SUM(CASE WHEN rc.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS generatedCount,
          COALESCE(SUM(CASE WHEN uc.status = 'in_stock' THEN 1 ELSE 0 END), 0) AS inStockCount,
          ib.created_at AS createdAt
        FROM inventory_batches ib
        INNER JOIN products p ON p.id = ib.product_id
        LEFT JOIN upstream_codes uc ON uc.batch_id = ib.id
        LEFT JOIN redeem_codes rc ON rc.upstream_code_id = uc.id
        GROUP BY ib.id, ib.batch_no, p.name, ib.supplier_name, ib.remark, ib.quantity, ib.created_at
        ORDER BY ib.created_at DESC
        LIMIT ?
      `,
    )
    .all(limit);

  return rows.map((row) => ({
    batchNo: row.batchNo,
    productName: row.productName,
    supplierName: row.supplierName,
    remark: row.remark,
    quantity: row.quantity,
    generatedCount: row.generatedCount,
    inStockCount: row.inStockCount,
    createdAt: row.createdAt,
  }));
}
