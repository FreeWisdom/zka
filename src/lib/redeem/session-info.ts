import { createHash } from 'node:crypto';
import { z } from 'zod';

import type { SessionInfoSnapshot } from './types';

const sessionInfoSchema = z.object({
  account: z.object({
    id: z.string().min(1).optional(),
    planType: z.string().min(1),
  }),
  user: z
    .object({
      email: z.string().email().optional(),
    })
    .optional(),
});

function hashSessionInfo(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function maskEmail(email?: string) {
  if (!email) {
    return '';
  }

  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    return email;
  }

  const visibleLocal = localPart.slice(0, 2);

  return `${visibleLocal}***@${domain}`;
}

function truncate(value: string, maxLength = 48) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

export function analyzeSessionInfo(sessionInfo: string): SessionInfoSnapshot {
  const hash = hashSessionInfo(sessionInfo);

  try {
    const parsed = sessionInfoSchema.parse(JSON.parse(sessionInfo));

    return {
      hash,
      masked: JSON.stringify({
        accountId: parsed.account.id ?? '',
        planType: parsed.account.planType,
        email: maskEmail(parsed.user?.email),
      }),
      accountId: parsed.account.id,
      planType: parsed.account.planType,
      email: parsed.user?.email,
    };
  } catch {
    return {
      hash,
      masked: truncate(sessionInfo),
      errorMessage: 'Session信息或账号异常 请复制全部内容重新提交',
    };
  }
}
