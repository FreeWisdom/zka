import { NextResponse } from 'next/server';

import { getEnvHealthSummary } from '@/lib/config/env';
import * as database from '@/lib/storage/database';

export async function GET() {
  const timestamp = new Date().toISOString();
  const environment = getEnvHealthSummary();

  try {
    const db = database.getDatabase();
    db.prepare('SELECT 1 AS ok').get();

    return NextResponse.json({
      success: true,
      message: '服务健康',
      data: {
        status: 'ok',
        timestamp,
        app: {
          status: 'ok',
          nodeEnv: environment.nodeEnv,
        },
        database: {
          status: 'ok',
          path: environment.databasePath,
        },
        config: {
          adminPasswordConfigured: environment.adminPasswordConfigured,
          upstreamConfigured: environment.upstreamConfigured,
          cardEncryptionKeyConfigured: environment.cardEncryptionKeyConfigured,
          alipayConfigured: environment.alipayConfigured,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';

    return NextResponse.json(
      {
        success: false,
        message: '服务异常',
        data: {
          status: 'degraded',
          timestamp,
          app: {
            status: 'ok',
            nodeEnv: environment.nodeEnv,
          },
          database: {
            status: 'error',
            path: environment.databasePath,
            message,
          },
          config: {
            adminPasswordConfigured: environment.adminPasswordConfigured,
            upstreamConfigured: environment.upstreamConfigured,
            cardEncryptionKeyConfigured: environment.cardEncryptionKeyConfigured,
            alipayConfigured: environment.alipayConfigured,
          },
        },
      },
      { status: 503 },
    );
  }
}
