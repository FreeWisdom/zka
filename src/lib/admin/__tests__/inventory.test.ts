import { beforeEach, describe, expect, it } from 'vitest';

import { GET as getBatchList } from '@/app/api/admin/batches/route';
import { GET as exportInventory } from '@/app/api/admin/inventory/export/route';
import { GET as getInventoryList } from '@/app/api/admin/inventory/route';
import { GET as revealInventory } from '@/app/api/admin/inventory/reveal/route';
import { POST as importInventory } from '@/app/api/admin/inventory/import/route';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionValue,
} from '@/lib/admin/auth';
import {
  importInventoryBatch,
  listInventoryBatches,
  listInventoryItems,
} from '@/lib/admin/inventory';
import { pairRedeemCode } from '@/lib/redeem/pair-redeem-code';

import { resetDatabase } from '../../redeem/__tests__/helpers';

function createAdminRequest(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);

  headers.set(
    'cookie',
    `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(
      createAdminSessionValue(process.env.ADMIN_PASSWORD ?? 'test-admin-password'),
    )}`,
  );

  return new Request(`http://localhost${path}`, {
    ...init,
    headers,
  });
}

describe('admin inventory import', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('imports upstream codes and generates redeem codes by default', async () => {
    const result = importInventoryBatch({
      productName: 'ChatGPT Plus 月卡',
      productSlug: 'chatgpt-plus-1m',
      codesText: ['UPSTREAM-IMPORT-0001', 'UPSTREAM-IMPORT-0001', 'UPSTREAM-IMPORT-0002'].join('\n'),
    });

    expect(result).toMatchObject({
      importedCount: 2,
      generatedCount: 2,
      existingCount: 0,
      duplicateInputCount: 1,
      uniqueCount: 2,
    });
    expect(result.items[0]?.redeemCode).toMatch(/^GIFT-/);

    const inventory = listInventoryItems();
    const batches = listInventoryBatches();

    expect(inventory).toHaveLength(2);
    expect(inventory.every((item) => item.redeemCode?.startsWith('GIFT-'))).toBe(true);
    expect(batches[0]).toMatchObject({
      quantity: 2,
      generatedCount: 2,
      inStockCount: 0,
    });
  });

  it('can generate a redeem code for previously imported stock', async () => {
    const imported = importInventoryBatch({
      productName: 'ChatGPT Plus 月卡',
      productSlug: 'chatgpt-plus-1m',
      codesText: 'UPSTREAM-STOCK-0001',
      generateRedeemCodes: false,
    });

    expect(imported).toMatchObject({
      importedCount: 1,
      generatedCount: 0,
    });

    const paired = await pairRedeemCode({
      upstreamCode: 'UPSTREAM-STOCK-0001',
    });

    expect(paired).toMatchObject({
      created: true,
      upstreamCodeMasked: 'UPST****0001',
    });
    expect(paired.code).toMatch(/^GIFT-/);

    const inventory = listInventoryItems();
    expect(inventory[0]).toMatchObject({
      upstreamStatus: 'bound',
      redeemCode: paired.code,
    });
  });

  it('exposes import, inventory and batch APIs', async () => {
    const importResponse = await importInventory(
      createAdminRequest('/api/admin/inventory/import', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          productName: 'ChatGPT Plus 月卡',
          productSlug: 'chatgpt-plus-1m',
          supplierName: '测试供应商',
          codesText: 'UPSTREAM-API-0001',
        }),
      }),
    );

    expect(importResponse.status).toBe(200);
    await expect(importResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        importedCount: 1,
        generatedCount: 1,
      },
    });

    const inventoryResponse = await getInventoryList(createAdminRequest('/api/admin/inventory'));
    const batchResponse = await getBatchList(createAdminRequest('/api/admin/batches'));

    await expect(inventoryResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        items: [
          {
            upstreamStatus: 'bound',
          },
        ],
      },
    });
    await expect(batchResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        items: [
          {
            supplierName: '测试供应商',
            generatedCount: 1,
          },
        ],
      },
    });
  });

  it('exports generated redeem codes as csv for a selected batch', async () => {
    const generatedBatch = importInventoryBatch({
      productName: 'ChatGPT Plus 月卡',
      productSlug: 'chatgpt-plus-1m',
      codesText: ['UPSTREAM-EXPORT-0001', 'UPSTREAM-EXPORT-0002'].join('\n'),
    });
    importInventoryBatch({
      productName: 'ChatGPT Plus 月卡',
      productSlug: 'chatgpt-plus-1m',
      codesText: 'UPSTREAM-EXPORT-STOCK-0001',
      generateRedeemCodes: false,
    });

    const response = await exportInventory(
      createAdminRequest(
        `/api/admin/inventory/export?batchNo=${encodeURIComponent(generatedBatch.batchNo)}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain(generatedBatch.batchNo);
    expect(response.headers.get('x-exported-count')).toBe('2');

    const text = (await response.text()).replace(/^\uFEFF/, '');

    expect(text).toContain(
      'batchNo,productName,upstreamCodeMasked,redeemCode,redeemStatus,upstreamStatus,deliverable,createdAt',
    );
    expect(text).toContain(generatedBatch.batchNo);
    expect(text).toContain('GIFT-');
    expect(text).toContain('yes');
    expect(text).not.toContain('UPSTREAM-EXPORT-STOCK-0001');
  });

  it('reveals a full upstream code for an authenticated admin', async () => {
    importInventoryBatch({
      productName: 'ChatGPT Plus 月卡',
      productSlug: 'chatgpt-plus-1m',
      codesText: 'REAL-UPSTREAM-0001',
    });

    const inventory = listInventoryItems();
    const response = await revealInventory(
      createAdminRequest(
        `/api/admin/inventory/reveal?upstreamCodeId=${encodeURIComponent(
          inventory[0]?.upstreamCodeId ?? '',
        )}`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        upstreamCode: 'REAL-UPSTREAM-0001',
      },
    });
  });

  it('rejects invalid reveal requests', async () => {
    const response = await revealInventory(
      createAdminRequest('/api/admin/inventory/reveal?upstreamCodeId='),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: '缺少上游卡密记录 ID',
    });
  });

  it('rejects unauthenticated admin inventory APIs', async () => {
    const inventoryResponse = await getInventoryList(
      new Request('http://localhost/api/admin/inventory'),
    );
    const batchResponse = await getBatchList(new Request('http://localhost/api/admin/batches'));
    const exportResponse = await exportInventory(
      new Request('http://localhost/api/admin/inventory/export'),
    );
    const revealResponse = await revealInventory(
      new Request('http://localhost/api/admin/inventory/reveal?upstreamCodeId=test-id'),
    );
    const importResponse = await importInventory(
      new Request('http://localhost/api/admin/inventory/import', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          productName: 'ChatGPT Plus 月卡',
          productSlug: 'chatgpt-plus-1m',
          codesText: 'UPSTREAM-API-0001',
        }),
      }),
    );

    expect(inventoryResponse.status).toBe(401);
    expect(batchResponse.status).toBe(401);
    expect(exportResponse.status).toBe(401);
    expect(revealResponse.status).toBe(401);
    expect(importResponse.status).toBe(401);
  });
});
