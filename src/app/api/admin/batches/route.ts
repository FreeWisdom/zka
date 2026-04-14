import { NextResponse } from 'next/server';

import {
  createAdminIpForbiddenResponse,
  createAdminUnauthorizedResponse,
  isAdminRequestIpAllowed,
  isAdminRequestAuthenticated,
} from '@/lib/admin/auth';
import { listInventoryBatches } from '@/lib/admin/inventory';

export async function GET(request: Request) {
  if (!isAdminRequestIpAllowed(request)) {
    return createAdminIpForbiddenResponse();
  }

  if (!isAdminRequestAuthenticated(request)) {
    return createAdminUnauthorizedResponse();
  }

  return NextResponse.json({
    success: true,
    message: '批次列表获取成功',
    data: {
      items: await listInventoryBatches(),
    },
  });
}
