import { NextResponse } from 'next/server';

import {
  createAdminIpForbiddenResponse,
  createAdminUnauthorizedResponse,
  isAdminRequestIpAllowed,
  isAdminRequestAuthenticated,
} from '@/lib/admin/auth';
import {
  InventoryImportError,
  revealInventoryUpstreamCode,
} from '@/lib/admin/inventory';

export async function GET(request: Request) {
  if (!isAdminRequestIpAllowed(request)) {
    return createAdminIpForbiddenResponse();
  }

  if (!isAdminRequestAuthenticated(request)) {
    return createAdminUnauthorizedResponse();
  }

  try {
    const { searchParams } = new URL(request.url);
    const upstreamCodeId = searchParams.get('upstreamCodeId') ?? '';
    const upstreamCode = await revealInventoryUpstreamCode(upstreamCodeId);

    return NextResponse.json({
      success: true,
      message: '完整上游卡密获取成功',
      data: {
        upstreamCode,
      },
    });
  } catch (error) {
    if (error instanceof InventoryImportError) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: '获取完整上游卡密失败，请稍后重试',
      },
      { status: 500 },
    );
  }
}
