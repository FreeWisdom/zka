import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createAdminIpForbiddenResponse,
  createAdminUnauthorizedResponse,
  isAdminRequestIpAllowed,
  isAdminRequestAuthenticated,
} from '@/lib/admin/auth';
import {
  InventoryImportError,
  type ImportInventoryResult,
  importInventoryBatch,
} from '@/lib/admin/inventory';
import { importInventorySchema } from '@/lib/validation/redeem';

function getInventoryImportMessage(result: ImportInventoryResult) {
  if (result.importedCount > 0) {
    return result.generateRedeemCodes
      ? '上游卡密已导入，并生成内部卡密'
      : '上游卡密已导入库存';
  }

  if (result.generatedCount > 0) {
    return '未新增库存，已为历史库存补发内部卡密';
  }

  return '未导入新卡密，重复卡密已跳过';
}

export async function POST(request: Request) {
  if (!isAdminRequestIpAllowed(request)) {
    return createAdminIpForbiddenResponse();
  }

  if (!isAdminRequestAuthenticated(request)) {
    return createAdminUnauthorizedResponse();
  }

  try {
    const payload = importInventorySchema.parse(await request.json());
    const result = await importInventoryBatch(payload);

    return NextResponse.json({
      success: true,
      message: getInventoryImportMessage(result),
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof InventoryImportError) {
      return NextResponse.json(
        {
          success: false,
          message: error instanceof z.ZodError ? error.issues[0]?.message : error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: '导入库存失败，请稍后重试',
      },
      { status: 500 },
    );
  }
}
