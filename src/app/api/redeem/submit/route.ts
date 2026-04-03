import { NextResponse } from 'next/server';
import { z } from 'zod';

import { RedeemCodeLookupError, RedeemSubmitError } from '@/lib/redeem/errors';
import { submitRedeem } from '@/lib/redeem/submit-redeem';
import { submitRedeemSchema } from '@/lib/validation/redeem';

export async function POST(request: Request) {
  try {
    const payload = submitRedeemSchema.parse(await request.json());
    const result = await submitRedeem(payload);

    return NextResponse.json({
      success: true,
      message: '兑换请求已提交',
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

    if (error instanceof RedeemSubmitError) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: '兑换提交失败，请稍后重试',
      },
      { status: 500 },
    );
  }
}
