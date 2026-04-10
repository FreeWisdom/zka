import { afterEach, describe, expect, it } from 'vitest';

import { POST as login } from '@/app/api/admin/login/route';
import { POST as logout } from '@/app/api/admin/logout/route';

describe('admin auth routes', () => {
  afterEach(() => {
    process.env.ADMIN_PASSWORD = 'test-admin-password';
  });

  it('creates an admin session cookie after a successful login', async () => {
    const response = await login(
      new Request('http://localhost/api/admin/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          password: 'test-admin-password',
          redirectTo: '/admin/inventory',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('zka_admin_session=');
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        redirectTo: '/admin/inventory',
      },
    });
  });

  it('rejects an invalid admin password', async () => {
    const response = await login(
      new Request('http://localhost/api/admin/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          password: 'wrong-password',
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: '管理员密码错误',
    });
  });

  it('clears the admin session cookie on logout', async () => {
    const response = await logout();

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: '已退出后台登录',
    });
  });

  it('reports missing admin password configuration', async () => {
    delete process.env.ADMIN_PASSWORD;

    const response = await login(
      new Request('http://localhost/api/admin/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          password: 'test-admin-password',
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: '后台管理员密码未配置',
    });
  });
});
