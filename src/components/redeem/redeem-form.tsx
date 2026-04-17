'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

type LookupState = {
  code: string;
  status: string;
  canSubmit: boolean;
  productName: string;
  message: string;
  upstreamCodeMasked: string;
  detailProductName: string | null;
  detailStatus: string;
  detailCompletedAt: string | null;
  accountEmail: string | null;
  inCooldown: boolean;
  cooldownRemaining: number;
};

type FeedbackState = {
  tone: 'error' | 'success' | 'warning';
  text: string;
};

type LookupTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

type SessionDraftPreview = {
  valid: boolean;
  planType?: string;
  accountId?: string;
  email?: string;
  errorMessage?: string;
};

function normalizeCodeInput(value: string) {
  return value.toUpperCase().replace(/\s+/g, '');
}

function formatCooldown(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '几分钟';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0 && remainingSeconds > 0) {
    return `${minutes} 分 ${remainingSeconds} 秒`;
  }

  if (minutes > 0) {
    return `${minutes} 分钟`;
  }

  return `${remainingSeconds} 秒`;
}

function formatDateTimeSafe(value?: string | null) {
  if (!value) {
    return '暂无';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getLookupTone(lookupState: LookupState | null): LookupTone {
  if (!lookupState) {
    return 'neutral';
  }

  if (lookupState.canSubmit) {
    return 'accent';
  }

  if (lookupState.status === 'success' || lookupState.detailStatus === '已完成') {
    return 'success';
  }

  if (lookupState.inCooldown || lookupState.detailStatus === '可重试') {
    return 'warning';
  }

  if (
    lookupState.status === 'locked' ||
    lookupState.detailStatus === '不可用' ||
    lookupState.status === 'submitted'
  ) {
    return 'danger';
  }

  return 'neutral';
}

function getLookupLabel(lookupState: LookupState | null) {
  if (!lookupState) {
    return '待开始';
  }

  if (lookupState.canSubmit) {
    return '可提交';
  }

  if (lookupState.status === 'success' || lookupState.detailStatus === '已完成') {
    return '已完成';
  }

  if (lookupState.inCooldown || lookupState.detailStatus === '可重试') {
    return '需等待';
  }

  if (lookupState.status === 'submitted') {
    return '处理中';
  }

  return '不可提交';
}

function analyzeSessionDraft(sessionInfo: string): SessionDraftPreview | null {
  const trimmed = sessionInfo.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      account?: {
        id?: unknown;
        planType?: unknown;
      };
      user?: {
        email?: unknown;
      };
    };
    const planType =
      typeof parsed.account?.planType === 'string' ? parsed.account.planType : undefined;

    if (!planType) {
      return {
        valid: false,
        errorMessage: 'Session 信息缺少 account.planType，无法判断账号是否可充值。',
      };
    }

    return {
      valid: true,
      planType,
      accountId:
        typeof parsed.account?.id === 'string' && parsed.account.id
          ? parsed.account.id
          : undefined,
      email:
        typeof parsed.user?.email === 'string' && parsed.user.email
          ? parsed.user.email
          : undefined,
    };
  } catch {
    return {
      valid: false,
      errorMessage: 'Session 信息不是合法 JSON，请重新复制完整内容。',
    };
  }
}

export function RedeemForm() {
  const router = useRouter();
  const sessionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [code, setCode] = useState('');
  const [sessionInfo, setSessionInfo] = useState('');
  const [forceRedeem, setForceRedeem] = useState(false);
  const [lookupState, setLookupState] = useState<LookupState | null>(null);
  const [lookupFeedback, setLookupFeedback] = useState<FeedbackState | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPending, startTransition] = useTransition();

  const sessionPreview = analyzeSessionDraft(sessionInfo);
  const lookupTone = getLookupTone(lookupState);
  const isSessionPlanFree =
    Boolean(sessionPreview?.valid) &&
    sessionPreview?.planType?.toLowerCase() === 'free';
  const isSessionPlanAllowed = forceRedeem || isSessionPlanFree;
  const canSubmitRequest =
    Boolean(lookupState?.canSubmit) &&
    sessionInfo.trim().length > 0 &&
    Boolean(sessionPreview?.valid) &&
    isSessionPlanAllowed;

  useEffect(() => {
    if (lookupState?.canSubmit) {
      sessionTextareaRef.current?.focus();
    }
  }, [lookupState?.canSubmit, lookupState?.code]);

  function handleCodeChange(value: string) {
    const nextCode = normalizeCodeInput(value);

    setCode(nextCode);
    setLookupFeedback(null);
    setSubmitErrorMessage(null);

    if (lookupState && lookupState.code !== nextCode) {
      setLookupState(null);
    }
  }

  async function handleCheckCode() {
    const normalizedCode = normalizeCodeInput(code);

    if (!normalizedCode) {
      setLookupState(null);
      setLookupFeedback({
        tone: 'error',
        text: '请输入 CDKEY 后再校验。',
      });
      return;
    }

    setCode(normalizedCode);
    setIsChecking(true);
    setLookupFeedback(null);
    setSubmitErrorMessage(null);

    try {
      const response = await fetch('/api/redeem/check-code', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code: normalizedCode }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setLookupState(null);
        setLookupFeedback({
          tone: 'error',
          text: payload.message ?? '兑换码校验失败，请稍后重试。',
        });
        return;
      }

      setLookupState(payload.data as LookupState);
      setLookupFeedback({
        tone: 'success',
        text: payload.message ?? '兑换码校验成功。',
      });
    } catch {
      setLookupState(null);
      setLookupFeedback({
        tone: 'error',
        text: '兑换码校验失败，请稍后重试。',
      });
    } finally {
      setIsChecking(false);
    }
  }

  async function submitRequest() {
    const normalizedCode = normalizeCodeInput(code);

    setSubmitErrorMessage(null);

    if (!lookupState?.canSubmit) {
      setSubmitErrorMessage('请先校验可提交的兑换码。');
      return;
    }

    if (!sessionInfo.trim()) {
      setSubmitErrorMessage('请先粘贴完整 Session 信息。');
      return;
    }

    if (!sessionPreview?.valid) {
      setSubmitErrorMessage(sessionPreview?.errorMessage ?? 'Session 信息无效，请重新复制。');
      return;
    }

    if (!forceRedeem && !isSessionPlanFree) {
      setSubmitErrorMessage(
        `当前账号 plan 为 ${sessionPreview.planType ?? '未知'}，仅支持 free plan 提交。`,
      );
      return;
    }

    try {
      const response = await fetch('/api/redeem/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          code: normalizedCode,
          sessionInfo,
          force: forceRedeem,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setSubmitErrorMessage(payload.message ?? '兑换提交失败，请稍后重试。');
        return;
      }

      router.push(`/redeem/result/${payload.data.requestNo}`);
    } catch {
      setSubmitErrorMessage('兑换提交失败，请稍后重试。');
    }
  }

  return (
    <div className="redeem-form-stack">
      <section className="redeem-card redeem-stage-card">
        <div className="redeem-stage-header">
          <div className="redeem-stage-title-wrap">
            <span className="redeem-stage-index">第一步</span>
            <div className="redeem-card-header">
              <h2>验证 CDKEY</h2>
              <p>输入兑换码后，系统会返回当前状态、商品信息以及是否允许继续提交。</p>
            </div>
          </div>

          <div className="redeem-stage-meta">
            <span className={`redeem-pill redeem-pill-${lookupTone}`}>
              {getLookupLabel(lookupState)}
            </span>
            {lookupState ? (
              <button
                className="redeem-button redeem-button-secondary redeem-inline-button"
                disabled={isChecking || isPending}
                onClick={handleCheckCode}
                type="button"
              >
                重新查询
              </button>
            ) : null}
          </div>
        </div>

        <div className="redeem-field-group">
          <label className="redeem-label" htmlFor="redeem-code">
            CDKEY 卡密
          </label>
          <div className="redeem-code-check-row">
            <input
              autoComplete="off"
              id="redeem-code"
              className="redeem-input"
              placeholder="例如：XXXX-XXXX-XXXX"
              value={code}
              onChange={(event) => handleCodeChange(event.target.value)}
            />
            <button
              className="redeem-button redeem-code-check-button"
              disabled={isChecking || isPending}
              onClick={handleCheckCode}
              type="button"
            >
              {isChecking ? '查询中...' : '查询卡密'}
            </button>
          </div>
          <span className="redeem-field-hint">
            支持直接粘贴卡密，系统会自动转成大写并移除空格。
          </span>
        </div>

        {lookupFeedback ? (
          <p
            className={`redeem-feedback redeem-${lookupFeedback.tone}`}
            role={lookupFeedback.tone === 'error' ? 'alert' : 'status'}
          >
            {lookupFeedback.text}
          </p>
        ) : null}

        {lookupState ? (
          <div className="redeem-status-card">
            <div className="redeem-status-head">
              <div className="redeem-status-copy">
                <strong>{lookupState.detailProductName ?? lookupState.productName}</strong>
                <span>{lookupState.message}</span>
              </div>
              <code>{lookupState.upstreamCodeMasked}</code>
            </div>

            <div className="redeem-status-grid">
              <div className="redeem-status-meta-item">
                <span>兑换码</span>
                <strong>{lookupState.code}</strong>
              </div>
              <div className="redeem-status-meta-item">
                <span>状态</span>
                <strong>{lookupState.detailStatus}</strong>
              </div>
              <div className="redeem-status-meta-item">
                <span>商品</span>
                <strong>{lookupState.productName}</strong>
              </div>
              <div className="redeem-status-meta-item">
                <span>完成时间</span>
                <strong>{formatDateTimeSafe(lookupState.detailCompletedAt)}</strong>
              </div>
              {lookupState.accountEmail ? (
                <div className="redeem-status-meta-item">
                  <span>已绑定账号</span>
                  <strong>{lookupState.accountEmail}</strong>
                </div>
              ) : null}
            </div>

            {lookupState.inCooldown ? (
              <p className="redeem-feedback redeem-warning" role="status">
                当前卡密处于冷却期，建议等待 {formatCooldown(lookupState.cooldownRemaining)}
                后再尝试提交。
              </p>
            ) : null}

            {!lookupState.canSubmit ? (
              <p className="redeem-feedback redeem-warning" role="status">
                该卡密当前不允许继续提交 Session，请根据状态提示处理。
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        className={`redeem-card redeem-stage-card${lookupState?.canSubmit ? '' : ' redeem-stage-card-disabled'}`}
      >
        <div className="redeem-stage-header">
          <div className="redeem-stage-title-wrap">
            <span className="redeem-stage-index">第二步</span>
            <div className="redeem-card-header">
              <h2>提交 Session 信息</h2>
              <p>提交前会先做本地检查。默认建议使用 free plan；如需覆盖已有会员，可勾选强制充值。</p>
            </div>
          </div>

          <div className="redeem-stage-meta">
            <span
              className={`redeem-pill ${
                lookupState?.canSubmit ? 'redeem-pill-accent' : 'redeem-pill-neutral'
              }`}
            >
              {lookupState?.canSubmit ? '待提交' : '等待查卡'}
            </span>
            <a
              className="redeem-inline-link"
              href="https://chatgpt.com/api/auth/session"
              rel="noreferrer"
              target="_blank"
            >
              获取 Session
            </a>
          </div>
        </div>

        <div className="redeem-info-grid">
          <div className="redeem-readonly-field">
            <span className="redeem-readonly-label">CDKEY</span>
            <strong className="redeem-readonly-value">
              {lookupState?.code ?? '请先完成卡密校验'}
            </strong>
          </div>
          <div className="redeem-readonly-field">
            <span className="redeem-readonly-label">礼物信息</span>
            <strong className="redeem-readonly-value">
              {lookupState?.productName ?? '等待读取商品信息'}
            </strong>
          </div>
        </div>

        <div className="redeem-inline-actions">
          <a
            className="redeem-button redeem-button-secondary"
            href="https://chatgpt.com/"
            rel="noreferrer"
            target="_blank"
          >
            打开 ChatGPT
          </a>
          <a
            className="redeem-button redeem-button-ghost"
            href="https://chatgpt.com/api/auth/session"
            rel="noreferrer"
            target="_blank"
          >
            打开 AuthSession
          </a>
        </div>

        <div className="redeem-field-group">
          <label className="redeem-label" htmlFor="session-info">
            Session 信息
          </label>
          <textarea
            id="session-info"
            ref={sessionTextareaRef}
            className="redeem-textarea"
            disabled={!lookupState?.canSubmit}
            placeholder='请粘贴完整 JSON，例如 {"account":{"planType":"free"}}'
            rows={8}
            value={sessionInfo}
            onChange={(event) => setSessionInfo(event.target.value)}
          />
          <span className="redeem-field-hint">
            只接受完整 JSON。默认建议使用 free plan；如需覆盖已有会员，可勾选强制充值后再提交。
          </span>
        </div>

        <label className="redeem-checkbox">
          <input
            checked={forceRedeem}
            disabled={!lookupState?.canSubmit || isChecking || isPending}
            onChange={(event) => setForceRedeem(event.target.checked)}
            type="checkbox"
          />
          <span>
            放弃剩余会员时间，强制充值
            <small>仅在你确认目标账号已有会员且需要覆盖充值时再勾选。</small>
          </span>
        </label>

        {sessionPreview ? (
          <div
            className={`redeem-session-preview${
              sessionPreview.valid ? '' : ' redeem-session-preview-error'
            }`}
          >
            {sessionPreview.valid ? (
              <div className="redeem-session-grid">
                <div className="redeem-session-item">
                  <span>账号 Plan</span>
                  <strong>{sessionPreview.planType}</strong>
                </div>
                <div className="redeem-session-item">
                  <span>账号 ID</span>
                  <strong>{sessionPreview.accountId ?? '未解析到'}</strong>
                </div>
                <div className="redeem-session-item">
                  <span>邮箱</span>
                  <strong>{sessionPreview.email ?? '未解析到'}</strong>
                </div>
              </div>
            ) : (
              <p className="redeem-feedback redeem-error" role="alert">
                {sessionPreview.errorMessage}
              </p>
            )}
          </div>
        ) : null}

        <details className="redeem-help-details">
          <summary>Session 获取说明</summary>
          <div className="redeem-help-block">
            <p>1. 在当前浏览器登录目标 ChatGPT 账号。</p>
            <p>2. 打开上方 AuthSession 页面，等待页面返回 JSON。</p>
            <p>3. 复制完整响应内容，原样粘贴到输入框中。</p>
          </div>
        </details>

        <div className="redeem-privacy-note">
          提交说明：系统仅在本次请求中使用完整 Session，落库时只保存脱敏摘要和哈希值，用于排查重复提交与异常状态。
        </div>

        {submitErrorMessage ? (
          <p className="redeem-feedback redeem-error" role="alert">
            {submitErrorMessage}
          </p>
        ) : null}

        <div className="redeem-actions">
          <button
            className="redeem-button"
            disabled={isChecking || isPending || !canSubmitRequest}
            onClick={() => startTransition(() => void submitRequest())}
            type="button"
          >
            {isPending ? '提交中...' : '提交充值'}
          </button>
        </div>
      </section>
    </div>
  );
}
