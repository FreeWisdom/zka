import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activateUpstreamCode,
  lookupBoundUpstreamCode,
} from '@/lib/redeem/upstream-adapter';
import { encodeUpstreamCode } from '@/lib/redeem/upstream-code';

function createUpstreamResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

describe('upstream adapter requests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.UPSTREAM_BASE_URL;
  });

  it('posts only documented json fields without custom auth headers', async () => {
    process.env.UPSTREAM_BASE_URL = 'https://upstream.example.com';

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        createUpstreamResponse({
          success: true,
          msg: '待提交',
          data: {
            cdkey: 'REAL-UPSTREAM-0001',
            gift_name: 'ChatGPT Plus',
            use_status: 0,
            status_hint: '待提交',
            account: '',
            completed_at: '',
            in_cooldown: false,
            cooldown_remaining: 0,
          },
        }),
      )
      .mockResolvedValueOnce(
        createUpstreamResponse({
          success: true,
          msg: '充值成功',
          data: {
            cdkey: 'REAL-UPSTREAM-0001',
            gift_name: 'ChatGPT Plus',
            use_status: 1,
            account: 'user@example.com',
            completed_at: '2026-03-18T01:00:00+08:00',
          },
        }),
      );

    await lookupBoundUpstreamCode({
      upstreamCodeEncrypted: encodeUpstreamCode('REAL-UPSTREAM-0001'),
    });

    await activateUpstreamCode({
      upstreamCodeEncrypted: encodeUpstreamCode('REAL-UPSTREAM-0001'),
      sessionInfo: {
        planType: 'free',
        accountId: 'user-1',
        email: 'user@example.com',
      },
      sessionInfoRaw:
        '{"account":{"id":"user-1","planType":"free"},"accessToken":"test-access-token","user":{"email":"user@example.com"}}',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [checkUrl, checkInit] = fetchSpy.mock.calls[0] ?? [];

    expect(checkUrl).toBeInstanceOf(URL);
    expect((checkUrl as URL).toString()).toBe('https://upstream.example.com/api/check');
    expect(checkInit).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        cdkey: 'REAL-UPSTREAM-0001',
      }),
      cache: 'no-store',
    });
    expect(checkInit?.headers).toEqual({
      'content-type': 'application/json',
    });

    const [activateUrl, activateInit] = fetchSpy.mock.calls[1] ?? [];

    expect(activateUrl).toBeInstanceOf(URL);
    expect((activateUrl as URL).toString()).toBe('https://upstream.example.com/api/activate');
    expect(activateInit).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        cdkey: 'REAL-UPSTREAM-0001',
        session_info:
          '{"account":{"id":"user-1","planType":"free"},"accessToken":"test-access-token","user":{"email":"user@example.com"}}',
      }),
      cache: 'no-store',
    });
    expect(activateInit?.headers).toEqual({
      'content-type': 'application/json',
    });
  });
});
