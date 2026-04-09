import { beforeEach, describe, expect, it } from 'vitest';

import { GET as getBatchList } from '@/app/api/admin/batches/route';
import { GET as getInventoryList } from '@/app/api/admin/inventory/route';
import { POST as importInventory } from '@/app/api/admin/inventory/import/route';
import {
  importInventoryBatch,
  listInventoryBatches,
  listInventoryItems,
} from '@/lib/admin/inventory';
import { pairRedeemCode } from '@/lib/redeem/pair-redeem-code';

import { resetDatabase } from '../../redeem/__tests__/helpers';

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
      new Request('http://localhost/api/admin/inventory/import', {
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

    const inventoryResponse = await getInventoryList();
    const batchResponse = await getBatchList();

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
});
