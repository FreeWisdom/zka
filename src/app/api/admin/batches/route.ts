import { NextResponse } from 'next/server';

import { listInventoryBatches } from '@/lib/admin/inventory';

export async function GET() {
  return NextResponse.json({
    success: true,
    message: '批次列表获取成功',
    data: {
      items: listInventoryBatches(),
    },
  });
}
