import { NextResponse } from 'next/server';

import {
  createAdminIpForbiddenResponse,
  createAdminUnauthorizedResponse,
  isAdminRequestIpAllowed,
  isAdminRequestAuthenticated,
} from '@/lib/admin/auth';
import { listInventoryItems } from '@/lib/admin/inventory';

export async function GET(request?: Request) {
  if (request && !isAdminRequestIpAllowed(request)) {
    return createAdminIpForbiddenResponse();
  }

  if (request && !isAdminRequestAuthenticated(request)) {
    return createAdminUnauthorizedResponse();
  }

  const { searchParams } = new URL(request?.url ?? 'http://localhost/api/admin/inventory');
  const batchNo = searchParams.get('batchNo');

  return NextResponse.json({
    success: true,
    message: '库存列表获取成功',
    data: {
      items: await listInventoryItems({
        batchNo,
        limit: batchNo ? null : 500,
      }),
    },
  });
}
