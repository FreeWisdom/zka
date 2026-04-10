'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type AdminLoginFormProps = {
  redirectTo: string;
};

type AdminLoginResponse = {
  success: boolean;
  message: string;
  data?: {
    redirectTo: string;
  };
};

export function AdminLoginForm({ redirectTo }: AdminLoginFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            password,
            redirectTo,
          }),
        });
        const payload = (await response.json()) as AdminLoginResponse;

        if (!response.ok || !payload.success) {
          setErrorMessage(payload.message || '后台登录失败');
          return;
        }

        router.replace(payload.data?.redirectTo || redirectTo);
        router.refresh();
      } catch {
        setErrorMessage('后台登录失败，请稍后重试');
      }
    });
  }

  return (
    <div className="redeem-card">
      <div className="redeem-card-header">
        <span className="redeem-kicker">zka Admin</span>
        <h1>后台登录</h1>
        <p>登录后才能导入上游卡密、生成内部卡密和查看库存。</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="redeem-field-group">
          <label className="redeem-label" htmlFor="admin-password">
            管理员密码
          </label>
          <input
            id="admin-password"
            className="redeem-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {errorMessage ? <p className="redeem-feedback redeem-error">{errorMessage}</p> : null}

        <div className="redeem-actions">
          <button className="redeem-button" type="submit" disabled={isPending}>
            {isPending ? '登录中...' : '登录后台'}
          </button>
        </div>
      </form>
    </div>
  );
}
