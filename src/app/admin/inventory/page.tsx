import type { Metadata } from 'next';

import { InventoryManager } from '@/components/admin/inventory-manager';
import { listInventoryBatches, listInventoryItems } from '@/lib/admin/inventory';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'zka 后台库存管理',
  description: 'zka 项目的后台库存导入与批次管理页面',
};

export default function AdminInventoryPage() {
  const batches = listInventoryBatches();
  const selectedBatchNo = batches[0]?.batchNo ?? null;

  return (
    <main className="redeem-shell admin-shell">
      <InventoryManager
        initialBatches={batches}
        initialInventory={
          selectedBatchNo ? listInventoryItems({ batchNo: selectedBatchNo }) : listInventoryItems()
        }
      />
    </main>
  );
}
