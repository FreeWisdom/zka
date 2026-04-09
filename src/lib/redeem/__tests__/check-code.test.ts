import { beforeEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/redeem/check-code/route';
import { checkRedeemCode } from '@/lib/redeem/check-code';

import { resetDatabase, seedRedeemFixtures } from './helpers';

describe('checkRedeemCode', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRedeemFixtures();
  });

  it('returns canSubmit=true for an unused redeem code', async () => {
    const result = await checkRedeemCode('GIFT-VALID-0001');

    expect(result).toMatchObject({
      code: 'GIFT-VALID-0001',
      status: 'unused',
      canSubmit: true,
      productName: `ChatGPT Plus ${'\u6708\u5361'}`,
      message: '\u5151\u6362\u7801\u53ef\u7528',
      upstreamCodeMasked: 'UPST****0001',
      upstreamLookup: {
        success: true,
        useStatus: 0,
        statusHint: '\u5f85\u63d0\u4ea4',
      },
    });
  });

  it('returns canSubmit=false for a locked redeem code', async () => {
    const result = await checkRedeemCode('GIFT-LOCKED-0001');

    expect(result).toMatchObject({
      code: 'GIFT-LOCKED-0001',
      status: 'locked',
      canSubmit: false,
      message: '\u5151\u6362\u7801\u5df2\u9501\u5b9a',
      upstreamCodeMasked: 'UPST****0001',
    });
  });

  it('rejects an unknown redeem code', async () => {
    await expect(checkRedeemCode('GIFT-MISSING-0001')).rejects.toThrow(
      '\u5151\u6362\u7801\u4e0d\u5b58\u5728',
    );
  });

  it('returns api payload for a valid code', async () => {
    const response = await POST(
      new Request('http://localhost/api/redeem/check-code', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code: 'GIFT-VALID-0001' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: '\u5151\u6362\u7801\u53ef\u7528',
      data: {
        code: 'GIFT-VALID-0001',
        status: 'unused',
        canSubmit: true,
        productName: `ChatGPT Plus ${'\u6708\u5361'}`,
        detailProductName: 'ChatGPT Plus',
        detailStatus: '\u5f85\u63d0\u4ea4',
        detailCompletedAt: null,
        detailAccountEmail: null,
      },
    });
  });

  it('does not expose upstream details in public api payload', async () => {
    const response = await POST(
      new Request('http://localhost/api/redeem/check-code', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code: 'GIFT-VALID-0001' }),
      }),
    );
    const payload = await response.json();

    expect(payload.data).not.toHaveProperty('upstreamCodeMasked');
    expect(payload.data).not.toHaveProperty('upstreamLookup');
  });

  it('returns 400 when the request body is invalid', async () => {
    const response = await POST(
      new Request('http://localhost/api/redeem/check-code', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ code: '' }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      message: '\u5151\u6362\u7801\u4e0d\u80fd\u4e3a\u7a7a',
    });
  });
});
