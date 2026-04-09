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
      statusHint: '\u5904\u7406\u4e2d\uff0c\u8bf7\u7a0d\u540e\u5237\u65b0',
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
      statusHint: '\u5151\u6362\u6210\u529f\uff0c\u8bf7\u767b\u5f55\u8d26\u53f7\u67e5\u770b\u7ed3\u679c',
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
      statusHint: '\u672c\u6b21\u5151\u6362\u5931\u8d25\uff0c\u53ef\u7a0d\u540e\u91cd\u8bd5',
      retryable: true,
    });
  });

  it('returns the status payload from the api route', async () => {
    const submission = await submitRedeem({
      code: 'GIFT-VALID-0001',
      sessionInfo: createSessionInfo(),
    });

    const response = await GET(
      new Request(`http://localhost/api/redeem/status/${submission.requestNo}`),
      {
        params: Promise.resolve({ requestNo: submission.requestNo }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: '\u67e5\u8be2\u6210\u529f',
      data: {
        requestNo: submission.requestNo,
        status: 'success',
      },
    });
  });

  it('throws for an unknown request number', async () => {
    await expect(getRedeemStatus('REQ-MISSING-0001')).rejects.toThrow(
      '\u5151\u6362\u8bf7\u6c42\u4e0d\u5b58\u5728',
    );
  });
});
