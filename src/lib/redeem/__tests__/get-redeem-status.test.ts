import { beforeEach, describe, expect, it } from 'vitest';

import { GET } from '@/app/api/redeem/status/[requestNo]/route';
import { getRedeemStatus } from '@/lib/redeem/get-redeem-status';
import { encodeUpstreamCode, hashUpstreamCode } from '@/lib/redeem/upstream-code';
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

function updateProcessingRequestUpstreamCode(requestNo: string, rawUpstreamCode: string) {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.prepare(
    `
      UPDATE upstream_codes
      SET
        upstream_code_encrypted = ?,
        upstream_code_hash = ?,
        updated_at = ?
      WHERE id = (
        SELECT rc.upstream_code_id
        FROM redeem_requests rr
        INNER JOIN redeem_codes rc ON rc.id = rr.redeem_code_id
        WHERE rr.request_no = ?
      )
    `,
  ).run(
    encodeUpstreamCode(rawUpstreamCode),
    hashUpstreamCode(rawUpstreamCode),
    now,
    requestNo,
  );
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

  it('refreshes processing requests into success when upstream check completes', async () => {
    const submission = await submitRedeem({
      code: 'GIFT-PROCESS-0001',
      sessionInfo: createSessionInfo(),
    });

    updateProcessingRequestUpstreamCode(submission.requestNo, 'UPSTREAM-USED-REFRESH-0001');

    const result = await getRedeemStatus(submission.requestNo, {
      refreshIfProcessing: true,
    });

    expect(result).toMatchObject({
      requestNo: submission.requestNo,
      status: 'success',
      statusHint: '兑换成功，请登录账号查看结果',
      retryable: false,
    });

    const db = getDatabase();
    const state = db
      .prepare<
        [string],
        {
          request_status: string;
          redeem_status: string;
          upstream_status: string;
          last_checked_at: string | null;
        }
      >(
        `
          SELECT
            rr.status AS request_status,
            rc.status AS redeem_status,
            uc.status AS upstream_status,
            rr.last_checked_at
          FROM redeem_requests rr
          INNER JOIN redeem_codes rc ON rc.id = rr.redeem_code_id
          INNER JOIN upstream_codes uc ON uc.id = rc.upstream_code_id
          WHERE rr.request_no = ?
        `,
      )
      .get(submission.requestNo);

    expect(state).toMatchObject({
      request_status: 'success',
      redeem_status: 'success',
      upstream_status: 'success',
    });
    expect(state?.last_checked_at).not.toBeNull();
  });

  it('refreshes processing requests into retryable failure when upstream check returns available again', async () => {
    const submission = await submitRedeem({
      code: 'GIFT-PROCESS-0001',
      sessionInfo: createSessionInfo(),
    });

    updateProcessingRequestUpstreamCode(submission.requestNo, 'UPSTREAM-AVAILABLE-REFRESH-0001');

    const result = await getRedeemStatus(submission.requestNo, {
      refreshIfProcessing: true,
    });

    expect(result).toMatchObject({
      requestNo: submission.requestNo,
      status: 'failed_retryable',
      statusHint: '本次兑换未完成，当前可重新提交',
      retryable: true,
    });
  });

  it('refreshes processing requests into final failure when upstream check reports invalid', async () => {
    const submission = await submitRedeem({
      code: 'GIFT-PROCESS-0001',
      sessionInfo: createSessionInfo(),
    });

    updateProcessingRequestUpstreamCode(submission.requestNo, 'UPSTREAM-INVALID-REFRESH-0001');

    const result = await getRedeemStatus(submission.requestNo, {
      refreshIfProcessing: true,
    });

    expect(result).toMatchObject({
      requestNo: submission.requestNo,
      status: 'failed_final',
      retryable: false,
      message: 'CDKEY 不存在',
    });
  });

  it('throttles repeated processing refreshes within 30 seconds', async () => {
    const submission = await submitRedeem({
      code: 'GIFT-PROCESS-0001',
      sessionInfo: createSessionInfo(),
    });

    await getRedeemStatus(submission.requestNo, {
      refreshIfProcessing: true,
    });

    const result = await getRedeemStatus(submission.requestNo, {
      refreshIfProcessing: true,
    });

    expect(result).toMatchObject({
      requestNo: submission.requestNo,
      status: 'processing',
      retryable: false,
      statusHint: '处理中，已在最近 30 秒内查询过，请稍后再试',
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

  it('returns refreshed status payload from the api route when refresh=1', async () => {
    const submission = await submitRedeem({
      code: 'GIFT-PROCESS-0001',
      sessionInfo: createSessionInfo(),
    });

    updateProcessingRequestUpstreamCode(submission.requestNo, 'UPSTREAM-USED-REFRESH-API-0001');

    const response = await GET(
      new Request(`http://localhost/api/redeem/status/${submission.requestNo}?refresh=1`),
      {
        params: Promise.resolve({ requestNo: submission.requestNo }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
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
