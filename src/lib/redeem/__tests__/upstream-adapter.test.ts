import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activateUpstreamCode,
  lookupBoundUpstreamCode,
} from '@/lib/redeem/upstream-adapter';
import { encodeUpstreamCode } from '@/lib/redeem/upstream-code';

function createUpstreamResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': 'application/json',
    }),
    text: async () => JSON.stringify(payload),
  } as Response;
}

describe('upstream adapter requests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.UPSTREAM_BASE_URL;
    delete process.env.UPSTREAM_DEBUG;
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

  it('logs masked upstream request and response when debug is enabled', async () => {
    process.env.UPSTREAM_BASE_URL = 'https://upstream.example.com';
    process.env.UPSTREAM_DEBUG = '1';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createUpstreamResponse({
        success: true,
        msg: 'ok',
        data: {
          cdkey: 'REAL-UPSTREAM-0001',
          gift_name: 'ChatGPT Plus',
          use_status: 1,
          status_hint: 'ok',
          account: 'user@example.com',
          completed_at: '2026-03-18T01:00:00+08:00',
        },
      }),
    );
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

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

    expect(consoleInfoSpy).toHaveBeenCalledTimes(2);
    expect(consoleInfoSpy.mock.calls[0]).toEqual([
      '[upstream-debug] request',
      expect.objectContaining({
        url: 'https://upstream.example.com/api/activate',
        method: 'POST',
        body: {
          cdkey: 'REAL****0001',
          session_info: '[masked]',
        },
      }),
    ]);
    expect(consoleInfoSpy.mock.calls[1]).toEqual([
      '[upstream-debug] response',
      expect.objectContaining({
        url: 'https://upstream.example.com/api/activate',
        status: 200,
        ok: true,
        bodyPreview: {
          success: true,
          msg: 'ok',
          data: {
            cdkey: 'REAL****0001',
            gift_name: 'ChatGPT Plus',
            use_status: 1,
            status_hint: 'ok',
            account: 'us***@example.com',
            completed_at: '2026-03-18T01:00:00+08:00',
          },
        },
      }),
    ]);
  });

  it('logs error cause details when upstream fetch fails', async () => {
    process.env.UPSTREAM_BASE_URL = 'https://upstream.example.com';
    process.env.UPSTREAM_DEBUG = '1';

    const fetchError = new TypeError('fetch failed', {
      cause: {
        code: 'ECONNRESET',
        message: 'socket hang up',
        errno: -4077,
        address: '203.0.113.10',
        port: 443,
      },
    });
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(fetchError);
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await lookupBoundUpstreamCode({
      upstreamCodeEncrypted: encodeUpstreamCode('REAL-UPSTREAM-0001'),
    });

    expect(consoleInfoSpy).toHaveBeenCalledTimes(2);
    expect(consoleInfoSpy.mock.calls[1]).toEqual([
      '[upstream-debug] error',
      expect.objectContaining({
        url: 'https://upstream.example.com/api/check',
        name: 'TypeError',
        message: 'fetch failed',
        cause: {
          name: undefined,
          code: 'ECONNRESET',
          message: 'socket hang up',
          errno: -4077,
          address: '203.0.113.10',
          port: 443,
        },
      }),
    ]);
  });
});
