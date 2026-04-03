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
      productName: 'ChatGPT Plus 月卡',
      message: '兑换码可用',
    });
  });

  it('returns canSubmit=false for a locked redeem code', async () => {
    const result = await checkRedeemCode('GIFT-LOCKED-0001');

    expect(result).toMatchObject({
      code: 'GIFT-LOCKED-0001',
      status: 'locked',
      canSubmit: false,
      message: '兑换码已锁定',
    });
  });

  it('rejects an unknown redeem code', async () => {
    await expect(checkRedeemCode('GIFT-MISSING-0001')).rejects.toThrow(
      '兑换码不存在',
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
      message: '兑换码可用',
      data: {
        code: 'GIFT-VALID-0001',
        status: 'unused',
        canSubmit: true,
        productName: 'ChatGPT Plus 月卡',
      },
    });
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
      message: '兑换码不能为空',
    });
  });
});
