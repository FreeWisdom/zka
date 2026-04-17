import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/redeem/submit/route';
import type { NormalizedUpstreamResult } from '@/lib/redeem/types';
import { submitRedeem } from '@/lib/redeem/submit-redeem';
import * as upstreamAdapter from '@/lib/redeem/upstream-adapter';
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a success request and marks the redeem code successful', async () => {
    const result = await submitRedeem({
      code: 'ZKA-VALID-0001',
      sessionInfo: createSessionInfo(),
    });

    expect(result.requestNo).toMatch(/^REQ/);
    expect(result).toMatchObject({
      status: 'success',
      retryable: false,
      message: '\u5151\u6362\u6210\u529f',
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
      .get('ZKA-VALID-0001');

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
      .get('ZKA-VALID-0001');

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

  it('returns failed_final for a non-free plan when force is not enabled', async () => {
    const result = await submitRedeem({
      code: 'ZKA-VALID-0001',
      sessionInfo: createSessionInfo('plus'),
    });

    expect(result).toMatchObject({
      status: 'failed_final',
      retryable: false,
      message: '\u8be5\u8d26\u53f7\u5f53\u524d plan \u4e3a plus\uff0c\u65e0\u6cd5\u8fdb\u884c\u5145\u503c',
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
      .get('ZKA-VALID-0001');

    expect(state).toMatchObject({
      redeem_status: 'failed',
      upstream_status: 'bound',
    });
  });

  it('allows forced recharge for a non-free plan', async () => {
    const result = await submitRedeem({
      code: 'ZKA-VALID-0001',
      sessionInfo: createSessionInfo('plus'),
      force: true,
    });

    expect(result).toMatchObject({
      status: 'success',
      retryable: false,
      message: '兑换成功',
    });
  });

  it('returns failed_retryable for a retryable upstream response', async () => {
    const result = await submitRedeem({
      code: 'ZKA-RETRY-0001',
      sessionInfo: createSessionInfo(),
    });

    expect(result).toMatchObject({
      status: 'failed_retryable',
      retryable: true,
      message:
        '\u793c\u7269\u5e93\u5b58\u4e0d\u8db3\uff0c\u8bf7\u7b49\u5f8515\u5206\u949f\u540e\u518d\u8bd5\u6216\u8054\u7cfb\u7ba1\u7406\u5458\u8865\u8d27',
    });
  });

  it('returns processing for an in-flight upstream response', async () => {
    const result = await submitRedeem({
      code: 'ZKA-PROCESS-0001',
      sessionInfo: createSessionInfo(),
    });

    expect(result).toMatchObject({
      status: 'processing',
      retryable: false,
      message: '\u5904\u7406\u4e2d\uff0c\u8bf7\u7a0d\u540e\u5237\u65b0',
    });
  });

  it('passes the force flag to upstream activation when forced recharge is selected', async () => {
    const activateSpy = vi.spyOn(upstreamAdapter, 'activateUpstreamCode');

    await submitRedeem({
      code: 'ZKA-VALID-0001',
      sessionInfo: createSessionInfo(),
      force: true,
    });

    expect(activateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
      }),
    );
  });

  it('reuses the same in-flight request for concurrent duplicate submits', async () => {
    let resolveActivate: ((value: NormalizedUpstreamResult) => void) | undefined;
    const activatePromise = new Promise<NormalizedUpstreamResult>((resolve) => {
      resolveActivate = resolve;
    });

    const activateSpy = vi
      .spyOn(upstreamAdapter, 'activateUpstreamCode')
      .mockImplementation(async () => activatePromise);
    const firstSubmit = submitRedeem({
      code: 'ZKA-VALID-0001',
      sessionInfo: createSessionInfo(),
    });
    const secondSubmit = submitRedeem({
      code: 'ZKA-VALID-0001',
      sessionInfo: createSessionInfo(),
    });

    const secondResult = await secondSubmit;

    resolveActivate?.({
      ok: true,
      state: 'success',
      retryable: false,
      message: '兑换成功',
      upstreamStatus: 'success',
      upstreamStatusCode: 1,
      completedAt: new Date().toISOString(),
      raw: {
        msg: '充值成功',
      },
    });

    const firstResult = await firstSubmit;

    expect(activateSpy).toHaveBeenCalledTimes(1);
    expect(secondResult).toMatchObject({
      requestNo: firstResult.requestNo,
      status: 'submitted',
      retryable: false,
      message: '兑换请求处理中，请稍后刷新',
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
          code: 'ZKA-VALID-0001',
          sessionInfo: createSessionInfo(),
          force: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: '\u5151\u6362\u8bf7\u6c42\u5df2\u63d0\u4ea4',
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
          code: 'ZKA-VALID-0001',
          sessionInfo: '',
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: 'session_info \u4e0d\u80fd\u4e3a\u7a7a',
    });
  });
});
