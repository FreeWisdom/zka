import type {
  NormalizedUpstreamResult,
  SessionInfoSnapshot,
} from './types';

function decodeUpstreamCode(encodedValue: string) {
  return Buffer.from(encodedValue, 'base64').toString('utf8');
}

export function activateUpstreamCode(input: {
  upstreamCodeEncrypted: string;
  sessionInfo: SessionInfoSnapshot;
}): NormalizedUpstreamResult {
  if (input.sessionInfo.errorMessage) {
    return {
      ok: false,
      state: 'failed_final',
      retryable: false,
      message: input.sessionInfo.errorMessage,
      upstreamStatus: 'bound',
      raw: {
        msg: input.sessionInfo.errorMessage,
      },
    };
  }

  if (input.sessionInfo.planType !== 'free') {
    const message = `该账号当前plan为${input.sessionInfo.planType} 无法进行充值`;

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

  const rawUpstreamCode = decodeUpstreamCode(input.upstreamCodeEncrypted);

  if (rawUpstreamCode.includes('PROCESS')) {
    return {
      ok: false,
      state: 'processing',
      retryable: false,
      message: '上游处理中，请稍后刷新',
      upstreamStatus: 'submitted',
      upstreamStatusCode: -1,
      raw: {
        msg: 'CDKEY 正在充值中',
      },
    };
  }

  if (rawUpstreamCode.includes('RETRY')) {
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

  if (rawUpstreamCode.includes('INVALID')) {
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
      completedAt,
    },
  };
}
