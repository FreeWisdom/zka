import { NextResponse } from 'next/server';

import { RedeemRequestLookupError } from '@/lib/redeem/errors';
import { getRedeemStatus } from '@/lib/redeem/get-redeem-status';

type RouteContext = {
  params: Promise<{
    requestNo: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { requestNo } = await context.params;
    const requestUrl = new URL(_request.url);
    const refreshIfProcessing = requestUrl.searchParams.get('refresh') === '1';
    const result = await getRedeemStatus(requestNo, {
      refreshIfProcessing,
    });

    return NextResponse.json({
      success: true,
      message: '查询成功',
      data: result,
    });
  } catch (error) {
    if (error instanceof RedeemRequestLookupError) {
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
        message: '查询兑换状态失败，请稍后重试',
      },
      { status: 500 },
    );
  }
}
