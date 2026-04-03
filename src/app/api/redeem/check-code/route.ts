import { NextResponse } from 'next/server';
import { z } from 'zod';

import { checkRedeemCode } from '@/lib/redeem/check-code';
import { RedeemCodeLookupError } from '@/lib/redeem/errors';
import { checkRedeemCodeSchema } from '@/lib/validation/redeem';

export async function POST(request: Request) {
  try {
    const payload = checkRedeemCodeSchema.parse(await request.json());
    const result = await checkRedeemCode(payload.code);

    return NextResponse.json({
      success: true,
      message: result.message,
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

    if (error instanceof RedeemCodeLookupError) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: '兑换码校验失败，请稍后重试',
      },
      { status: 500 },
    );
  }
}
