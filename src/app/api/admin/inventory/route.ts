import { NextResponse } from 'next/server';

import {
  createAdminUnauthorizedResponse,
  isAdminRequestAuthenticated,
} from '@/lib/admin/auth';
import { listInventoryItems } from '@/lib/admin/inventory';

export async function GET(request?: Request) {
  if (request && !isAdminRequestAuthenticated(request)) {
    return createAdminUnauthorizedResponse();
  }

  const { searchParams } = new URL(request?.url ?? 'http://localhost/api/admin/inventory');
  const batchNo = searchParams.get('batchNo');

  return NextResponse.json({
    success: true,
    message: '库存列表获取成功',
    data: {
      items: listInventoryItems({
        batchNo,
      }),
    },
  });
}
