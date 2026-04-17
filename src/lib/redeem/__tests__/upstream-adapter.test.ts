import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activateUpstreamCode,
  lookupBoundUpstreamCode,
} from '@/lib/redeem/upstream-adapter';
import { encodeUpstreamCode } from '@/lib/redeem/upstream-code';

function parseDebugLogEntry(message: string) {
  const jsonStart = message.indexOf('{');

  return {
    prefix: jsonStart === -1 ? message : message.slice(0, jsonStart).trimEnd(),
    payload: jsonStart === -1 ? null : JSON.parse(message.slice(jsonStart)),
  };
}

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
        'user-agent': 'zka-server',
      },
      body: JSON.stringify({
        cdkey: 'REAL-UPSTREAM-0001',
      }),
      cache: 'no-store',
    });
    expect(checkInit?.headers).toEqual({
      'content-type': 'application/json',
      'user-agent': 'zka-server',
    });

    const [activateUrl, activateInit] = fetchSpy.mock.calls[1] ?? [];

    expect(activateUrl).toBeInstanceOf(URL);
    expect((activateUrl as URL).toString()).toBe('https://upstream.example.com/api/activate');
    expect(activateInit).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'zka-server',
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
      'user-agent': 'zka-server',
    });
  });

  it('posts force=1 when forced activation is requested for a non-free plan', async () => {
    process.env.UPSTREAM_BASE_URL = 'https://upstream.example.com';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createUpstreamResponse({
        success: true,
        msg: 'ok',
        data: {
          cdkey: 'REAL-UPSTREAM-0001',
          gift_name: 'ChatGPT Plus',
          use_status: 1,
          account: 'user@example.com',
          completed_at: '2026-03-18T01:00:00+08:00',
        },
      }),
    );

    await activateUpstreamCode({
      upstreamCodeEncrypted: encodeUpstreamCode('REAL-UPSTREAM-0001'),
      sessionInfo: {
        planType: 'plus',
        accountId: 'user-1',
        email: 'user@example.com',
      },
      sessionInfoRaw:
        '{"account":{"id":"user-1","planType":"plus"},"accessToken":"test-access-token","user":{"email":"user@example.com"}}',
      force: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [activateUrl, activateInit] = fetchSpy.mock.calls[0] ?? [];

    expect(activateUrl).toBeInstanceOf(URL);
    expect((activateUrl as URL).toString()).toBe('https://upstream.example.com/api/activate');
    expect(activateInit).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        cdkey: 'REAL-UPSTREAM-0001',
        session_info:
          '{"account":{"id":"user-1","planType":"plus"},"accessToken":"test-access-token","user":{"email":"user@example.com"}}',
        force: 1,
      }),
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
    const requestLog = parseDebugLogEntry(String(consoleInfoSpy.mock.calls[0]?.[0]));
    const responseLog = parseDebugLogEntry(String(consoleInfoSpy.mock.calls[1]?.[0]));

    expect(requestLog).toEqual({
      prefix: '[upstream-debug] request',
      payload: {
        url: 'https://upstream.example.com/api/activate',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'zka-server',
        },
        body: {
          cdkey: 'REAL****0001',
          session_info: '[masked]',
        },
      },
    });
    expect(responseLog.prefix).toBe('[upstream-debug] response');
    expect(responseLog.payload).toMatchObject({
      url: 'https://upstream.example.com/api/activate',
      status: 200,
      ok: true,
      headers: {
        'content-type': 'application/json',
      },
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
    });
    expect(responseLog.payload?.durationMs).toEqual(expect.any(Number));
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
    const errorLog = parseDebugLogEntry(String(consoleInfoSpy.mock.calls[1]?.[0]));

    expect(errorLog.prefix).toBe('[upstream-debug] error');
    expect(errorLog.payload).toMatchObject({
      url: 'https://upstream.example.com/api/check',
      name: 'TypeError',
      message: 'fetch failed',
      cause: {
        code: 'ECONNRESET',
        message: 'socket hang up',
        errno: -4077,
        address: '203.0.113.10',
        port: 443,
      },
    });
    expect(errorLog.payload?.durationMs).toEqual(expect.any(Number));
  });
});
