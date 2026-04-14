import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createAdminIpForbiddenResponse,
  createAdminUnauthorizedResponse,
  isAdminRequestIpAllowed,
  isAdminRequestAuthenticated,
} from '@/lib/admin/auth';
import { pairRedeemCode } from '@/lib/redeem/pair-redeem-code';
import { pairRedeemCodeSchema } from '@/lib/validation/redeem';

export async function POST(request: Request) {
  if (!isAdminRequestIpAllowed(request)) {
    return createAdminIpForbiddenResponse();
  }

  if (!isAdminRequestAuthenticated(request)) {
    return createAdminUnauthorizedResponse();
  }

  try {
    const payload = pairRedeemCodeSchema.parse(await request.json());
    const result = await pairRedeemCode(payload);

    return NextResponse.json({
      success: true,
      message: result.created ? '内部卡密已生成' : '已找到已绑定的内部卡密',
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          message: error.issues[0]?.message ?? '请求参数不合法',
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: '生成内部卡密失败，请稍后重试',
      },
      { status: 500 },
    );
  }
}
