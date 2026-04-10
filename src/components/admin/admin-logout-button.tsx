'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function AdminLogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
        });
      } finally {
        router.replace('/admin/login');
        router.refresh();
      }
    });
  }

  return (
    <button
      className="redeem-button redeem-button-secondary"
      type="button"
      onClick={handleLogout}
      disabled={isPending}
    >
      {isPending ? '退出中...' : '退出登录'}
    </button>
  );
}
