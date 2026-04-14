import type { Metadata } from 'next';

import { AdminLogoutButton } from '@/components/admin/admin-logout-button';
import { InventoryManager } from '@/components/admin/inventory-manager';
import { redirectIfAdminUnauthenticated } from '@/lib/admin/auth';
import { listInventoryBatches, listInventoryItems } from '@/lib/admin/inventory';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'zka 后台库存管理',
  description: 'zka 项目的后台库存导入与批次管理页面',
};

export default async function AdminInventoryPage() {
  await redirectIfAdminUnauthenticated('/admin/inventory');

  const batches = await listInventoryBatches();
  const selectedBatchNo = batches[0]?.batchNo ?? null;

  return (
    <main className="redeem-shell admin-shell admin-dashboard-shell">
      <section className="redeem-card admin-toolbar-card">
        <div className="redeem-card-header admin-toolbar-copy">
          <span className="redeem-kicker">zka Admin</span>
          <h1>后台库存管理</h1>
          <p>当前页面已启用后台登录保护，顶部信息尽量压缩，方便把更多高度留给下面的库存与批次内容。</p>
        </div>

        <div className="redeem-actions admin-toolbar-actions">
          <AdminLogoutButton />
        </div>
      </section>

      <InventoryManager
        initialBatches={batches}
        initialInventory={
          selectedBatchNo
            ? await listInventoryItems({ batchNo: selectedBatchNo, limit: null })
            : await listInventoryItems()
        }
      />
    </main>
  );
}
