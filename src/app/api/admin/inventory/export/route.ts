import {
  createAdminUnauthorizedResponse,
  isAdminRequestAuthenticated,
} from '@/lib/admin/auth';
import { exportInventoryItems } from '@/lib/admin/inventory';

export async function GET(request: Request) {
  if (!isAdminRequestAuthenticated(request)) {
    return createAdminUnauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const batchNo = searchParams.get('batchNo');
  const exported = exportInventoryItems({
    batchNo,
  });

  return new Response(`\uFEFF${exported.csv}`, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${exported.filename}"`,
      'content-type': 'text/csv; charset=utf-8',
      'x-exported-count': String(exported.itemCount),
    },
  });
}
