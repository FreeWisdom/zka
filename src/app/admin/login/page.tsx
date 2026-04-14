import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AdminLoginForm } from '@/components/admin/admin-login-form';
import {
  getAdminLoginRedirectPath,
  isAdminViewerIpAllowed,
  isAdminViewerAuthenticated,
} from '@/lib/admin/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'zka 后台登录',
  description: 'zka 项目的后台管理员登录页',
};

type AdminLoginPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const { next } = await searchParams;
  const redirectTo = getAdminLoginRedirectPath(next);

  if (!(await isAdminViewerIpAllowed())) {
    return (
      <main className="redeem-shell admin-shell">
        <section className="redeem-card">
          <div className="redeem-card-header">
            <span className="redeem-kicker">zka Admin</span>
            <h1>后台访问受限</h1>
            <p>当前 IP 不在允许列表内，后台登录已被拒绝。</p>
          </div>
        </section>
      </main>
    );
  }

  if (await isAdminViewerAuthenticated()) {
    redirect(redirectTo);
  }

  return (
    <main className="redeem-shell admin-shell">
      <AdminLoginForm redirectTo={redirectTo} />
    </main>
  );
}
