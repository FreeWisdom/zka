import { NextResponse } from 'next/server';

import { clearAdminSessionCookie } from '@/lib/admin/auth';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: '已退出后台登录',
  });

  return clearAdminSessionCookie(response);
}
