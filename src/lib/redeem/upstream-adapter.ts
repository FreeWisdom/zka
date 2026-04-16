import { getServerEnv } from '@/lib/config/env';

import { decodeUpstreamCode, maskUpstreamCode } from './upstream-code';
import type {
  NormalizedUpstreamResult,
  SessionInfoSnapshot,
  UpstreamLookupResult,
} from './types';

const DEFAULT_UPSTREAM_BASE_URL = 'https://gpt.86gamestore.com';
const UPSTREAM_TIMEOUT_MS = 10_000;
const UPSTREAM_DEBUG_BODY_LIMIT = 600;
const UPSTREAM_USER_AGENT = 'zka-server';

type UpstreamEnvelope = {
  success?: boolean;
  msg?: string;
  data?: UpstreamDataPayload | string;
};

type UpstreamDataPayload = {
  cdkey?: string;
  gift_name?: string;
  use_status?: number;
  status_hint?: string;
  account?: string;
  completed_at?: string;
  in_cooldown?: boolean;
  cooldown_remaining?: number;
};

function isUpstreamDebugEnabled() {
  return getServerEnv().upstreamDebugEnabled;
}

function getUpstreamApiBaseUrl() {
  const configuredBaseUrl = getServerEnv().upstreamBaseUrl;

  if (!configuredBaseUrl) {
    if (isProductionEnvironment()) {
      throw new Error('UPSTREAM_BASE_URL 未配置，生产环境无法调用上游接口');
    }

    return `${DEFAULT_UPSTREAM_BASE_URL}/api`;
  }

  const trimmedBaseUrl = configuredBaseUrl.replace(/\/+$/, '');

  return trimmedBaseUrl.endsWith('/api') ? trimmedBaseUrl : `${trimmedBaseUrl}/api`;
}

function isProductionEnvironment() {
  return getServerEnv().nodeEnv === 'production';
}

function isMockUpstreamCode(rawUpstreamCode: string) {
  return rawUpstreamCode.startsWith('UPSTREAM-');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUpstreamDataPayload(value: unknown): value is UpstreamDataPayload {
  return isObject(value);
}

function truncateDebugText(value: string, limit = UPSTREAM_DEBUG_BODY_LIMIT) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}...`;
}

function maskEmail(value: string) {
  const [localPart, domain = ''] = value.split('@');

  if (!domain) {
    if (value.length <= 4) {
      return '[masked]';
    }

    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  const maskedLocalPart =
    localPart.length <= 2 ? `${localPart.slice(0, 1)}***` : `${localPart.slice(0, 2)}***`;

  return `${maskedLocalPart}@${domain}`;
}

function sanitizeDebugValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string') {
    return sanitizeDebugData(value);
  }

  switch (key) {
    case 'cdkey':
      return maskUpstreamCode(value);
    case 'session_info':
    case 'accessToken':
    case 'authorization':
    case 'token':
      return '[masked]';
    case 'account':
    case 'email':
      return maskEmail(value);
    default:
      return value;
  }
}

function sanitizeDebugData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugData(item));
  }

  if (!isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitizeDebugValue(key, item)]),
  );
}

function createResponseBodyPreview(responseText: string) {
  if (!responseText) {
    return '';
  }

  try {
    return sanitizeDebugData(JSON.parse(responseText));
  } catch {
    return truncateDebugText(responseText);
  }
}

function logUpstreamDebug(label: string, details: Record<string, unknown>) {
  if (!isUpstreamDebugEnabled()) {
    return;
  }

  console.info(`[upstream-debug] ${label} ${JSON.stringify(details)}`);
}

function getErrorCauseDetails(error: unknown) {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== 'object') {
    return undefined;
  }

  const cause = error.cause as Record<string, unknown>;

  return {
    name: typeof cause.name === 'string' ? cause.name : undefined,
    code: typeof cause.code === 'string' ? cause.code : undefined,
    message: typeof cause.message === 'string' ? cause.message : undefined,
    errno:
      typeof cause.errno === 'number' || typeof cause.errno === 'string'
        ? cause.errno
        : undefined,
    address: typeof cause.address === 'string' ? cause.address : undefined,
    port: typeof cause.port === 'number' ? cause.port : undefined,
  };
}

function isRetryableMessage(message: string) {
  return (
    message.includes('库存不足') ||
    message.includes('分钟后') ||
    message.includes('稍后再试') ||
    message.includes('暂时无法提交')
  );
}

function isProcessingMessage(message: string) {
  return message.includes('处理中') || message.includes('正在充值中');
}

function isInvalidMessage(message: string) {
  return (
    message.includes('不存在') ||
    message.includes('异常') ||
    message.includes('作废') ||
    message.includes('不可用')
  );
}

function isAlreadyCompletedMessage(message: string) {
  return message.includes('充值成功') || message.includes('已充值成功');
}

async function requestUpstream(
  path: string,
  payload: Record<string, unknown>,
): Promise<UpstreamEnvelope> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const requestUrl = new URL(path.replace(/^\//, ''), `${getUpstreamApiBaseUrl()}/`);
  const requestHeaders = {
    'content-type': 'application/json',
    'user-agent': UPSTREAM_USER_AGENT,
  };
  const requestStartedAt = Date.now();

  try {
    logUpstreamDebug('request', {
      url: requestUrl.toString(),
      method: 'POST',
      headers: requestHeaders,
      body: sanitizeDebugData(payload),
    });

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });
    const responseText = await response.text();

    logUpstreamDebug('response', {
      url: requestUrl.toString(),
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - requestStartedAt,
      headers: Object.fromEntries(response.headers.entries()),
      bodyPreview: createResponseBodyPreview(responseText),
    });

    if (!response.ok) {
      throw new Error(`请求失败，HTTP ${response.status}`);
    }

    const result = responseText ? (JSON.parse(responseText) as unknown) : null;

    if (!isObject(result)) {
      throw new Error('返回了无效响应');
    }

    return result as UpstreamEnvelope;
  } catch (error) {
    logUpstreamDebug('error', {
      url: requestUrl.toString(),
      durationMs: Date.now() - requestStartedAt,
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      cause: getErrorCauseDetails(error),
    });

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createLookupResult(
  rawUpstreamCode: string,
  envelope: UpstreamEnvelope,
): UpstreamLookupResult {
  const data = isUpstreamDataPayload(envelope.data) ? envelope.data : undefined;
  const message = data?.status_hint ?? envelope.msg ?? '查询失败';

  return {
    success: Boolean(envelope.success),
    codeMasked: maskUpstreamCode(data?.cdkey ?? rawUpstreamCode),
    message,
    giftName: data?.gift_name,
    useStatus: typeof data?.use_status === 'number' ? data.use_status : undefined,
    statusHint: data?.status_hint ?? envelope.msg,
    accountEmail: data?.account,
    completedAt: data?.completed_at,
    inCooldown: data?.in_cooldown,
    cooldownRemaining: data?.cooldown_remaining,
  };
}

function createMockCheckResult(rawUpstreamCode: string): UpstreamLookupResult {
  if (rawUpstreamCode.includes('PROCESS')) {
    return {
      success: true,
      codeMasked: maskUpstreamCode(rawUpstreamCode),
      message: '正在领取中，请稍后再查询',
      useStatus: -1,
      statusHint: '正在领取中，请稍后再查询',
      giftName: 'ChatGPT Plus',
      inCooldown: false,
      cooldownRemaining: 0,
    };
  }

  if (rawUpstreamCode.includes('RETRY')) {
    return {
      success: true,
      codeMasked: maskUpstreamCode(rawUpstreamCode),
      message: '礼物库存不足，请等待15分钟后再试或联系管理员补货',
      useStatus: -9,
      statusHint: '礼物库存不足，请等待15分钟后再试或联系管理员补货',
      giftName: 'ChatGPT Plus',
      inCooldown: true,
      cooldownRemaining: 900,
    };
  }

  if (rawUpstreamCode.includes('USED')) {
    return {
      success: true,
      codeMasked: maskUpstreamCode(rawUpstreamCode),
      message: '充值已完成，上号查看结果',
      useStatus: 1,
      statusHint: '充值已完成，上号查看结果',
      giftName: 'ChatGPT Plus',
      completedAt: new Date().toISOString(),
    };
  }

  if (rawUpstreamCode.includes('INVALID')) {
    return {
      success: false,
      codeMasked: maskUpstreamCode(rawUpstreamCode),
      message: 'CDKEY 不存在',
    };
  }

  return {
    success: true,
    codeMasked: maskUpstreamCode(rawUpstreamCode),
    message: '待提交',
    useStatus: 0,
    statusHint: '待提交',
    giftName: 'ChatGPT Plus',
    inCooldown: false,
    cooldownRemaining: 0,
  };
}

function createMockActivateResult(input: {
  rawUpstreamCode: string;
  sessionInfo: SessionInfoSnapshot;
}): NormalizedUpstreamResult {
  if (input.rawUpstreamCode.includes('PROCESS')) {
    return {
      ok: false,
      state: 'processing',
      retryable: false,
      message: '处理中，请稍后刷新',
      upstreamStatus: 'submitted',
      upstreamStatusCode: -1,
      raw: {
        msg: 'CDKEY 正在充值中',
      },
    };
  }

  if (input.rawUpstreamCode.includes('RETRY')) {
    return {
      ok: false,
      state: 'failed_retryable',
      retryable: true,
      message: '礼物库存不足，请等待15分钟后再试或联系管理员补货',
      upstreamStatus: 'bound',
      upstreamStatusCode: -9,
      raw: {
        msg: '礼物库存不足，请等待15分钟后再试或联系管理员补货',
      },
    };
  }

  if (input.rawUpstreamCode.includes('INVALID')) {
    return {
      ok: false,
      state: 'failed_final',
      retryable: false,
      message: 'CDK异常',
      upstreamStatus: 'invalid',
      upstreamStatusCode: -999,
      raw: {
        msg: 'CDK异常',
      },
    };
  }

  const completedAt = new Date().toISOString();

  return {
    ok: true,
    state: 'success',
    retryable: false,
    message: '兑换成功',
    upstreamStatus: 'success',
    upstreamStatusCode: 1,
    completedAt,
    raw: {
      msg: '充值成功',
      account: input.sessionInfo.email ?? input.sessionInfo.accountId ?? '',
      completed_at: completedAt,
    },
  };
}

function createBoundFinalResult(message: string): NormalizedUpstreamResult {
  return {
    ok: false,
    state: 'failed_final',
    retryable: false,
    message,
    upstreamStatus: 'bound',
    raw: {
      msg: message,
    },
  };
}

function normalizeActivateResult(envelope: UpstreamEnvelope): NormalizedUpstreamResult {
  const data = isUpstreamDataPayload(envelope.data) ? envelope.data : undefined;
  const upstreamStatusCode =
    typeof data?.use_status === 'number' ? data.use_status : undefined;
  const message = data?.status_hint ?? envelope.msg ?? '兑换失败';

  if (upstreamStatusCode === 1 || isAlreadyCompletedMessage(message)) {
    const completedAt = data?.completed_at ?? new Date().toISOString();

    return {
      ok: true,
      state: 'success',
      retryable: false,
      message: '兑换成功',
      upstreamStatus: 'success',
      upstreamStatusCode: 1,
      completedAt,
      raw: envelope,
    };
  }

  if (upstreamStatusCode === -1 || isProcessingMessage(message)) {
    return {
      ok: false,
      state: 'processing',
      retryable: false,
      message: data?.status_hint ?? '处理中，请稍后刷新',
      upstreamStatus: 'submitted',
      upstreamStatusCode: -1,
      raw: envelope,
    };
  }

  if (upstreamStatusCode === -9 || isRetryableMessage(message)) {
    return {
      ok: false,
      state: 'failed_retryable',
      retryable: true,
      message,
      upstreamStatus: 'bound',
      upstreamStatusCode: upstreamStatusCode ?? -9,
      raw: envelope,
    };
  }

  if (
    upstreamStatusCode === -999 ||
    upstreamStatusCode === -1000 ||
    isInvalidMessage(message)
  ) {
    return {
      ok: false,
      state: 'failed_final',
      retryable: false,
      message,
      upstreamStatus: 'invalid',
      upstreamStatusCode: upstreamStatusCode ?? -999,
      raw: envelope,
    };
  }

  return {
    ok: false,
    state: 'failed_final',
    retryable: false,
    message,
    upstreamStatus: 'bound',
    upstreamStatusCode,
    raw: envelope,
  };
}

export async function lookupBoundUpstreamCode(input: {
  upstreamCodeEncrypted: string;
}): Promise<UpstreamLookupResult> {
  const rawUpstreamCode = decodeUpstreamCode(input.upstreamCodeEncrypted);

  if (isMockUpstreamCode(rawUpstreamCode) && !isProductionEnvironment()) {
    return createMockCheckResult(rawUpstreamCode);
  }

  if (isMockUpstreamCode(rawUpstreamCode)) {
    return {
      success: false,
      codeMasked: maskUpstreamCode(rawUpstreamCode),
      message: '生产环境已禁用演示卡密，请联系管理员处理',
    };
  }

  try {
    const envelope = await requestUpstream('check', {
      cdkey: rawUpstreamCode,
    });

    return createLookupResult(rawUpstreamCode, envelope);
  } catch (error) {
    return {
      success: false,
      codeMasked: maskUpstreamCode(rawUpstreamCode),
      message: error instanceof Error ? error.message : '查询失败，请稍后重试',
    };
  }
}

export async function activateUpstreamCode(input: {
  upstreamCodeEncrypted: string;
  sessionInfo: SessionInfoSnapshot;
  sessionInfoRaw: string;
}): Promise<NormalizedUpstreamResult> {
  if (input.sessionInfo.errorMessage) {
    return createBoundFinalResult(input.sessionInfo.errorMessage);
  }

  if (input.sessionInfo.planType !== 'free') {
    return createBoundFinalResult(
      `该账号当前 plan 为 ${input.sessionInfo.planType}，无法进行充值`,
    );
  }

  const rawUpstreamCode = decodeUpstreamCode(input.upstreamCodeEncrypted);

  if (isMockUpstreamCode(rawUpstreamCode) && !isProductionEnvironment()) {
    return createMockActivateResult({
      rawUpstreamCode,
      sessionInfo: input.sessionInfo,
    });
  }

  if (isMockUpstreamCode(rawUpstreamCode)) {
    return createBoundFinalResult('生产环境已禁用演示卡密，请联系管理员处理');
  }

  try {
    const envelope = await requestUpstream('activate', {
      cdkey: rawUpstreamCode,
      session_info: input.sessionInfoRaw,
    });

    return normalizeActivateResult(envelope);
  } catch (error) {
    const message = error instanceof Error ? error.message : '兑换失败，请稍后重试';

    return {
      ok: false,
      state: 'failed_retryable',
      retryable: true,
      message,
      upstreamStatus: 'bound',
      raw: {
        msg: message,
      },
    };
  }
}
