import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AdminLoginForm } from '@/components/admin/admin-login-form';
import {
  getAdminLoginRedirectPath,
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

  if (await isAdminViewerAuthenticated()) {
    redirect(redirectTo);
  }

  return (
    <main className="redeem-shell admin-shell">
      <AdminLoginForm redirectTo={redirectTo} />
    </main>
  );
}
