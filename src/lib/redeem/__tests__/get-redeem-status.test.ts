import { beforeEach, describe, expect, it } from 'vitest';

import { GET } from '@/app/api/redeem/status/[requestNo]/route';
import { getRedeemStatus } from '@/lib/redeem/get-redeem-status';
import { submitRedeem } from '@/lib/redeem/submit-redeem';

import { resetDatabase, seedRedeemFixtures } from './helpers';

function createSessionInfo(planType = 'free') {
  return JSON.stringify({
    account: {
      id: 'user-1',
      planType,
    },
    accessToken: 'test-access-token',
    user: {
      email: 'user@example.com',
    },
  });
}

describe('getRedeemStatus', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRedeemFixtures();
  });

  it('shows a processing hint for processing requests', async () => {
    const submission = await submitRedeem({
      code: 'GIFT-PROCESS-0001',
      sessionInfo: createSessionInfo(),
    });

    const result = await getRedeemStatus(submission.requestNo);

    expect(result).toMatchObject({
      requestNo: submission.requestNo,
      status: 'processing',
      statusHint: '上游处理中，请稍后刷新',
      retryable: false,
    });
  });

  it('shows a success hint for completed requests', async () => {
    const submission = await submitRedeem({
      code: 'GIFT-VALID-0001',
      sessionInfo: createSessionInfo(),
    });

    const result = await getRedeemStatus(submission.requestNo);

    expect(result).toMatchObject({
      requestNo: submission.requestNo,
      status: 'success',
      statusHint: '兑换成功，请登录账号查看结果',
      retryable: false,
    });
  });

  it('marks retryable failures correctly', async () => {
    const submission = await submitRedeem({
      code: 'GIFT-RETRY-0001',
      sessionInfo: createSessionInfo(),
    });

    const result = await getRedeemStatus(submission.requestNo);

    expect(result).toMatchObject({
      requestNo: submission.requestNo,
      status: 'failed_retryable',
      statusHint: '本次兑换失败，可稍后重试',
      retryable: true,
    });
  });

  it('returns the status payload from the api route', async () => {
    const submission = await submitRedeem({
      code: 'GIFT-VALID-0001',
      sessionInfo: createSessionInfo(),
    });

    const response = await GET(
      new Request(
        `http://localhost/api/redeem/status/${submission.requestNo}`,
      ),
      {
        params: Promise.resolve({ requestNo: submission.requestNo }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: '查询成功',
      data: {
        requestNo: submission.requestNo,
        status: 'success',
      },
    });
  });

  it('throws for an unknown request number', async () => {
    await expect(getRedeemStatus('REQ-MISSING-0001')).rejects.toThrow(
      '兑换请求不存在',
    );
  });
});
