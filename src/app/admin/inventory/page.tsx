import { InventoryManager } from '@/components/admin/inventory-manager';
import { listInventoryBatches, listInventoryItems } from '@/lib/admin/inventory';

export const dynamic = 'force-dynamic';

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
