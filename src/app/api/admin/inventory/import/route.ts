import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createAdminUnauthorizedResponse,
  isAdminRequestAuthenticated,
} from '@/lib/admin/auth';
import {
  InventoryImportError,
  importInventoryBatch,
} from '@/lib/admin/inventory';
import { importInventorySchema } from '@/lib/validation/redeem';

export async function POST(request: Request) {
  if (!isAdminRequestAuthenticated(request)) {
    return createAdminUnauthorizedResponse();
  }

  try {
    const payload = importInventorySchema.parse(await request.json());
    const result = importInventoryBatch(payload);

    return NextResponse.json({
      success: true,
      message: result.generateRedeemCodes
        ? '上游卡密已导入，并生成内部卡密'
        : '上游卡密已导入库存',
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
