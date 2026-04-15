import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/admin/redeem-codes/pair/route';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionValue,
} from '@/lib/admin/auth';
import { pairRedeemCode } from '@/lib/redeem/pair-redeem-code';
import { getDatabase } from '@/lib/storage/database';

import { resetDatabase } from './helpers';

function createFetchResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

function createAdminHeaders() {
  return {
    'content-type': 'application/json',
    cookie: `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(
      createAdminSessionValue(process.env.ADMIN_PASSWORD ?? 'test-admin-password'),
    )}`,
  };
}

describe('pairRedeemCode', () => {
  beforeEach(async () => {
    await resetDatabase();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createFetchResponse({
          success: true,
          msg: '待提交',
          data: {
            cdkey: 'REAL-UPSTREAM-0001',
            gift_name: 'ChatGPT Plus',
            use_status: 0,
            status_hint: '待提交',
            in_cooldown: false,
            cooldown_remaining: 0,
          },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates a new redeem code paired with an upstream code', async () => {
    const result = await pairRedeemCode({
      upstreamCode: 'REAL-UPSTREAM-0001',
    });

    expect(result).toMatchObject({
      created: true,
      productName: 'ChatGPT Plus 月卡',
      upstreamCodeMasked: 'REAL****0001',
      upstreamLookup: {
        success: true,
        useStatus: 0,
        statusHint: '待提交',
      },
    });
    expect(result.code).toMatch(/^ZKA-/);

    const db = getDatabase();
    const row = db
      .prepare<
        [string],
        { code: string }
      >(
        `
          SELECT rc.code AS code
          FROM redeem_codes rc
          WHERE rc.code = ?
        `,
      )
      .get(result.code);

    expect(row).toMatchObject({
      code: result.code,
    });
  });

  it('returns the same redeem code when the upstream code is paired twice', async () => {
    const first = await pairRedeemCode({
      upstreamCode: 'REAL-UPSTREAM-0001',
    });
    const second = await pairRedeemCode({
      upstreamCode: 'REAL-UPSTREAM-0001',
    });

    expect(second).toMatchObject({
      code: first.code,
      created: false,
    });
  });

  it('returns api payload for pair route', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/redeem-codes/pair', {
        method: 'POST',
        headers: createAdminHeaders(),
        body: JSON.stringify({
          upstreamCode: 'REAL-UPSTREAM-0001',
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: '内部卡密已生成',
      data: {
        created: true,
        upstreamCodeMasked: 'REAL****0001',
      },
    });
  });

  it('rejects unauthenticated pair requests', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/redeem-codes/pair', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          upstreamCode: 'REAL-UPSTREAM-0001',
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: '请先登录后台',
    });
  });
});
