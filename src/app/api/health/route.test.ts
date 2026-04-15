import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/health/route';
import * as database from '@/lib/storage/database';

describe('GET /api/health', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ADMIN_PASSWORD;
    delete process.env.UPSTREAM_BASE_URL;
    delete process.env.CARD_ENCRYPTION_KEY;
    delete process.env.ALIPAY_APP_ID;
    delete process.env.ALIPAY_PRIVATE_KEY;
    delete process.env.ALIPAY_PUBLIC_KEY;
    delete process.env.ALIPAY_NOTIFY_URL;
  });

  it('returns app and database health', async () => {
    process.env.ADMIN_PASSWORD = 'admin-secret';
    process.env.UPSTREAM_BASE_URL = 'https://upstream.example.com';
    process.env.CARD_ENCRYPTION_KEY = 'card-encryption-key';
    process.env.ALIPAY_APP_ID = 'alipay-app-id';
    process.env.ALIPAY_PRIVATE_KEY = 'alipay-private-key';
    process.env.ALIPAY_PUBLIC_KEY = 'alipay-public-key';
    process.env.ALIPAY_NOTIFY_URL = 'https://zka.example.com/api/orders/pay/callback';

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.status).toBe('ok');
    expect(payload.data.app.status).toBe('ok');
    expect(payload.data.database.status).toBe('ok');
    expect(payload.data.database.path).toContain('platform-b.test.db');
    expect(payload.data.config).toEqual({
      adminPasswordConfigured: true,
      upstreamConfigured: true,
      cardEncryptionKeyConfigured: true,
      alipayConfigured: true,
    });
  });

  it('marks the service degraded when database access fails', async () => {
    vi.spyOn(database, 'getDatabase').mockImplementation(() => {
      throw new Error('database unavailable');
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.success).toBe(false);
    expect(payload.data.status).toBe('degraded');
    expect(payload.data.database.status).toBe('error');
    expect(payload.data.database.message).toBe('database unavailable');
  });
});
