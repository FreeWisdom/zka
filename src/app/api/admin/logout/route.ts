import { NextResponse } from 'next/server';

import {
  clearAdminSessionCookie,
  createAdminIpForbiddenResponse,
  isAdminRequestIpAllowed,
} from '@/lib/admin/auth';

export async function POST(request: Request) {
  if (!isAdminRequestIpAllowed(request)) {
    return createAdminIpForbiddenResponse();
  }

  const response = NextResponse.json({
    success: true,
    message: '已退出后台登录',
  });

  return clearAdminSessionCookie(response);
}
