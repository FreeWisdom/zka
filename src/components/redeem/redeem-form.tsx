'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type LookupState = {
  code: string;
  status: string;
  canSubmit: boolean;
  productName: string;
  message: string;
};

export function RedeemForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [sessionInfo, setSessionInfo] = useState('');
  const [lookupState, setLookupState] = useState<LookupState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleCheckCode() {
    setIsChecking(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/redeem/check-code', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setLookupState(null);
        setErrorMessage(payload.message ?? '兑换码校验失败');
        return;
      }

      setLookupState(payload.data);
      setSuccessMessage(payload.message ?? '兑换码校验成功');
    } catch {
      setLookupState(null);
      setErrorMessage('兑换码校验失败，请稍后重试');
    } finally {
      setIsChecking(false);
    }
  }

  async function submitRequest() {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/redeem/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          code,
          sessionInfo,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setErrorMessage(payload.message ?? '兑换提交失败');
        return;
      }

      router.push(`/redeem/result/${payload.data.requestNo}`);
    } catch {
      setErrorMessage('兑换提交失败，请稍后重试');
    }
  }

  return (
    <div className="redeem-card">
      <div className="redeem-card-header">
        <span className="redeem-kicker">Platform B</span>
        <h1>提交内部兑换码</h1>
        <p>
          先校验兑换码，再粘贴完整的 <code>session_info</code> 发起兑换。
        </p>
      </div>

      <div className="redeem-field-group">
        <label className="redeem-label" htmlFor="redeem-code">
          内部兑换码
        </label>
        <input
          id="redeem-code"
          className="redeem-input"
          placeholder="例如 GIFT-9X2K-7WQ4-ABCD"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </div>

      <div className="redeem-actions">
        <button
          className="redeem-button redeem-button-secondary"
          disabled={isChecking || isPending}
          onClick={handleCheckCode}
          type="button"
        >
          {isChecking ? '校验中...' : '校验兑换码'}
        </button>
      </div>

      {lookupState ? (
        <div className="redeem-status-card">
          <strong>{lookupState.productName}</strong>
          <span>{lookupState.message}</span>
          <span>
            当前状态：<code>{lookupState.status}</code>
          </span>
        </div>
      ) : null}

      <div className="redeem-field-group">
        <label className="redeem-label" htmlFor="session-info">
          session_info
        </label>
        <textarea
          id="session-info"
          className="redeem-textarea"
          placeholder='粘贴完整 JSON，例如 {"account":{"planType":"free"}}'
          rows={8}
          value={sessionInfo}
          onChange={(event) => setSessionInfo(event.target.value)}
        />
      </div>

      {errorMessage ? <p className="redeem-feedback redeem-error">{errorMessage}</p> : null}
      {successMessage ? (
        <p className="redeem-feedback redeem-success">{successMessage}</p>
      ) : null}

      <div className="redeem-actions">
        <button
          className="redeem-button"
          disabled={isChecking || isPending}
          onClick={() => startTransition(() => void submitRequest())}
          type="button"
        >
          {isPending ? '提交中...' : '提交兑换'}
        </button>
      </div>
    </div>
  );
}
