import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  appendAdminSessionCookie,
  createAdminSessionValue,
  getAdminLoginRedirectPath,
  verifyAdminPassword,
} from '@/lib/admin/auth';
import { getServerEnv } from '@/lib/config/env';

const adminLoginSchema = z.object({
  password: z.string().min(1, '管理员密码不能为空'),
  redirectTo: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const payload = adminLoginSchema.parse(await request.json());
    const configuredPassword = getServerEnv().adminPassword;

    if (!configuredPassword) {
      return NextResponse.json(
        {
          success: false,
          message: '后台管理员密码未配置',
        },
        { status: 503 },
      );
    }

    if (!verifyAdminPassword(payload.password)) {
      return NextResponse.json(
        {
          success: false,
          message: '管理员密码错误',
        },
        { status: 401 },
      );
    }

    const redirectTo = getAdminLoginRedirectPath(payload.redirectTo);
    const response = NextResponse.json({
      success: true,
      message: '登录成功',
      data: {
        redirectTo,
      },
    });

    return appendAdminSessionCookie(response, createAdminSessionValue(configuredPassword));
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
        message: '后台登录失败，请稍后重试',
      },
      { status: 500 },
    );
  }
}
