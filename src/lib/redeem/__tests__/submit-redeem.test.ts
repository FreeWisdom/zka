import { beforeEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/redeem/submit/route';
import { submitRedeem } from '@/lib/redeem/submit-redeem';
import { getDatabase } from '@/lib/storage/database';

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

describe('submitRedeem', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRedeemFixtures();
  });

  it('creates a success request and marks the redeem code successful', async () => {
    const result = await submitRedeem({
      code: 'GIFT-VALID-0001',
      sessionInfo: createSessionInfo(),
    });

    expect(result.requestNo).toMatch(/^REQ/);
    expect(result).toMatchObject({
      status: 'success',
      retryable: false,
      message: '兑换成功',
    });

    const db = getDatabase();
    const redeemCode = db
      .prepare<
        [string],
        {
          status: string;
          redeemed_at: string | null;
          last_error_message: string | null;
        }
      >(
        `
          SELECT status, redeemed_at, last_error_message
          FROM redeem_codes
          WHERE code = ?
        `,
      )
      .get('GIFT-VALID-0001');

    expect(redeemCode).toMatchObject({
      status: 'success',
      last_error_message: null,
    });
    expect(redeemCode?.redeemed_at).not.toBeNull();

    const upstreamCode = db
      .prepare<
        [string],
        {
          status: string;
        }
      >(
        `
          SELECT uc.status
          FROM upstream_codes uc
          INNER JOIN redeem_codes rc ON rc.upstream_code_id = uc.id
          WHERE rc.code = ?
        `,
      )
      .get('GIFT-VALID-0001');

    expect(upstreamCode).toMatchObject({
      status: 'success',
    });

    const redeemRequest = db
      .prepare<
        [string],
        {
          status: string;
          attempt_no: number;
          session_info_hash: string;
          session_info_masked: string;
        }
      >(
        `
          SELECT status, attempt_no, session_info_hash, session_info_masked
          FROM redeem_requests
          WHERE request_no = ?
        `,
      )
      .get(result.requestNo);

    expect(redeemRequest).toMatchObject({
      status: 'success',
      attempt_no: 1,
    });
    expect(redeemRequest?.session_info_hash).toHaveLength(64);
    expect(redeemRequest?.session_info_masked).toContain('us***@example.com');
  });

  it('returns failed_final for a non-free plan without consuming the upstream code', async () => {
    const result = await submitRedeem({
      code: 'GIFT-VALID-0001',
      sessionInfo: createSessionInfo('plus'),
    });

    expect(result).toMatchObject({
      status: 'failed_final',
      retryable: false,
      message: '该账号当前plan为plus 无法进行充值',
    });

    const db = getDatabase();
    const state = db
      .prepare<
        [string],
        {
          redeem_status: string;
          upstream_status: string;
        }
      >(
        `
          SELECT
            rc.status AS redeem_status,
            uc.status AS upstream_status
          FROM redeem_codes rc
          INNER JOIN upstream_codes uc ON uc.id = rc.upstream_code_id
          WHERE rc.code = ?
        `,
      )
      .get('GIFT-VALID-0001');

    expect(state).toMatchObject({
      redeem_status: 'failed',
      upstream_status: 'bound',
    });
  });

  it('returns failed_retryable for a retryable upstream response', async () => {
    const result = await submitRedeem({
      code: 'GIFT-RETRY-0001',
      sessionInfo: createSessionInfo(),
    });

    expect(result).toMatchObject({
      status: 'failed_retryable',
      retryable: true,
      message: '礼物库存不足，请等待15分钟后再试或联系管理员补货',
    });
  });

  it('returns processing for an in-flight upstream response', async () => {
    const result = await submitRedeem({
      code: 'GIFT-PROCESS-0001',
      sessionInfo: createSessionInfo(),
    });

    expect(result).toMatchObject({
      status: 'processing',
      retryable: false,
      message: '上游处理中，请稍后刷新',
    });
  });

  it('returns api payload for a successful submit', async () => {
    const response = await POST(
      new Request('http://localhost/api/redeem/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          code: 'GIFT-VALID-0001',
          sessionInfo: createSessionInfo(),
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: '兑换请求已提交',
      data: {
        status: 'success',
        retryable: false,
      },
    });
  });

  it('returns 400 when sessionInfo is missing', async () => {
    const response = await POST(
      new Request('http://localhost/api/redeem/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          code: 'GIFT-VALID-0001',
          sessionInfo: '',
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'session_info 不能为空',
    });
  });
});
