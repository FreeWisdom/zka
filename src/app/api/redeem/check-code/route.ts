import { NextResponse } from 'next/server';
import { z } from 'zod';

import { checkRedeemCode } from '@/lib/redeem/check-code';
import { RedeemCodeLookupError } from '@/lib/redeem/errors';
import type { UpstreamLookupResult } from '@/lib/redeem/types';
import { checkRedeemCodeSchema } from '@/lib/validation/redeem';

function mapDetailStatus(lookup: UpstreamLookupResult) {
  switch (lookup.useStatus) {
    case 1:
      return '已完成';
    case -1:
      return '处理中';
    case -9:
      return '可重试';
    case -999:
    case -1000:
      return '不可用';
    case 0:
      return '待提交';
    default:
      return lookup.statusHint ?? lookup.message;
  }
}

export async function POST(request: Request) {
  try {
    const payload = checkRedeemCodeSchema.parse(await request.json());
    const result = await checkRedeemCode(payload.code);
    const publicResult = {
      code: result.code,
      status: result.status,
      canSubmit: result.canSubmit,
      productName: result.productName,
      message: result.message,
      upstreamCodeMasked: result.upstreamCodeMasked,
      detailProductName: result.upstreamLookup.giftName ?? null,
      detailStatus: mapDetailStatus(result.upstreamLookup),
      detailCompletedAt: result.upstreamLookup.completedAt ?? null,
      accountEmail: result.upstreamLookup.accountEmail ?? null,
      inCooldown: Boolean(result.upstreamLookup.inCooldown),
      cooldownRemaining: result.upstreamLookup.cooldownRemaining ?? 0,
    };

    return NextResponse.json({
      success: true,
      message: result.message,
      data: publicResult,
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
