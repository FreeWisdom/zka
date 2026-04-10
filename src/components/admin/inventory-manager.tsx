'use client';

import { useState } from 'react';

import type {
  BatchListItem,
  ImportInventoryResult,
  InventoryListItem,
} from '@/lib/admin/inventory';

type InventoryManagerProps = {
  initialBatches: BatchListItem[];
  initialInventory: InventoryListItem[];
};

type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

const DEFAULT_FORM = {
  productName: 'ChatGPT Plus 月卡',
  productSlug: 'chatgpt-plus-1m',
  supplierName: '',
  remark: '',
  codesText: '',
  generateRedeemCodes: true,
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getResultStatusLabel(status: ImportInventoryResult['items'][number]['status']) {
  switch (status) {
    case 'generated':
      return '新导入并发码';
    case 'imported':
      return '仅导入库存';
    case 'paired_existing':
      return '历史库存补发码';
    case 'existing':
      return '已存在';
    default:
      return status;
  }
}

function getInventoryStatusLabel(status: string) {
  switch (status) {
    case 'bound':
      return '已绑定';
    case 'in_stock':
      return '库存中';
    case 'submitted':
      return '已提交';
    case 'success':
      return '已完成';
    case 'invalid':
      return '不可用';
    default:
      return status;
  }
}

async function refreshAdminInventory(batchNo: string | null) {
  const inventoryUrl = batchNo
    ? `/api/admin/inventory?batchNo=${encodeURIComponent(batchNo)}`
    : '/api/admin/inventory';
  const [inventoryResponse, batchResponse] = await Promise.all([
    fetch(inventoryUrl, {
      cache: 'no-store',
    }),
    fetch('/api/admin/batches', {
      cache: 'no-store',
    }),
  ]);
  const [inventoryPayload, batchPayload] = (await Promise.all([
    inventoryResponse.json(),
    batchResponse.json(),
  ])) as [
    ApiResponse<{ items: InventoryListItem[] }>,
    ApiResponse<{ items: BatchListItem[] }>,
  ];

  if (!inventoryResponse.ok || !inventoryPayload.success) {
    throw new Error(inventoryPayload.message || '刷新库存列表失败');
  }

  if (!batchResponse.ok || !batchPayload.success) {
    throw new Error(batchPayload.message || '刷新批次列表失败');
  }

  return {
    inventory: inventoryPayload.data.items,
    batches: batchPayload.data.items,
  };
}

export function InventoryManager({
  initialBatches,
  initialInventory,
}: InventoryManagerProps) {
  const [formState, setFormState] = useState(DEFAULT_FORM);
  const [inventory, setInventory] = useState(initialInventory);
  const [batches, setBatches] = useState(initialBatches);
  const [selectedBatchNo, setSelectedBatchNo] = useState<string | null>(
    initialBatches[0]?.batchNo ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [lastImport, setLastImport] = useState<ImportInventoryResult | null>(null);
  const selectedBatch = batches.find((batch) => batch.batchNo === selectedBatchNo) ?? null;
  const filteredInventory = inventory;

  async function handleBatchSelect(batchNo: string) {
    setInventoryLoading(true);
    setErrorMessage('');

    try {
      const refreshed = await refreshAdminInventory(batchNo);

      setInventory(refreshed.inventory);
      setBatches(refreshed.batches);
      setSelectedBatchNo(batchNo);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '切换批次失败');
    } finally {
      setInventoryLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/admin/inventory/import', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(formState),
      });
      const payload = (await response.json()) as ApiResponse<ImportInventoryResult>;

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || '导入库存失败');
      }

      const refreshed = await refreshAdminInventory(payload.data.batchNo);

      setInventory(refreshed.inventory);
      setBatches(refreshed.batches);
      setSelectedBatchNo(payload.data.batchNo);
      setLastImport(payload.data);
      setSuccessMessage(payload.message);
      setFormState((current) => ({
        ...current,
        codesText: '',
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导入库存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-stack">
      <section className="redeem-card">
        <div className="redeem-card-header">
          <span className="redeem-kicker">zka</span>
          <h1>导入上游卡密</h1>
          <p>
            支持直接粘贴文本或 CSV 片段。默认会在导入时同步生成内部兑换码，方便立刻给
            B 端测试。
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="admin-form-grid">
            <div className="redeem-field-group">
              <label className="redeem-label" htmlFor="productName">
                商品名称
              </label>
              <input
                className="redeem-input"
                id="productName"
                value={formState.productName}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    productName: event.target.value,
                  }))
                }
              />
            </div>

            <div className="redeem-field-group">
              <label className="redeem-label" htmlFor="productSlug">
                商品标识
              </label>
              <input
                className="redeem-input"
                id="productSlug"
                value={formState.productSlug}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    productSlug: event.target.value,
                  }))
                }
              />
            </div>

            <div className="redeem-field-group">
              <label className="redeem-label" htmlFor="supplierName">
                供应商
              </label>
              <input
                className="redeem-input"
                id="supplierName"
                placeholder="可选，用于批次追踪"
                value={formState.supplierName}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    supplierName: event.target.value,
                  }))
                }
              />
            </div>

            <div className="redeem-field-group">
              <label className="redeem-label" htmlFor="remark">
                备注
              </label>
              <input
                className="redeem-input"
                id="remark"
                placeholder="可选，记录采购或测试用途"
                value={formState.remark}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    remark: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="redeem-field-group">
            <label className="redeem-label" htmlFor="codesText">
              上游卡密 / CSV 内容
            </label>
            <textarea
              className="redeem-textarea"
              id="codesText"
              placeholder={'一行一个，或直接粘贴逗号分隔 / CSV 的 cdkey 列'}
              value={formState.codesText}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  codesText: event.target.value,
                }))
              }
            />
          </div>

          <label className="admin-checkbox">
            <input
              checked={formState.generateRedeemCodes}
              type="checkbox"
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  generateRedeemCodes: event.target.checked,
                }))
              }
            />
            <span>导入后立即生成内部卡密</span>
          </label>

          <div className="redeem-actions">
            <button className="redeem-button" disabled={submitting} type="submit">
              {submitting ? '导入中...' : '开始导入'}
            </button>
          </div>
        </form>

        {errorMessage ? <p className="redeem-feedback redeem-error">{errorMessage}</p> : null}
        {successMessage ? <p className="redeem-feedback redeem-success">{successMessage}</p> : null}
      </section>

      {lastImport ? (
        <section className="redeem-card">
          <div className="redeem-card-header">
            <span className="redeem-kicker">最近一次导入</span>
            <h2>批次 {lastImport.batchNo}</h2>
          </div>

          <div className="admin-summary-grid">
            <div className="admin-summary-card">
              <strong>{lastImport.importedCount}</strong>
              <span>新导入</span>
            </div>
            <div className="admin-summary-card">
              <strong>{lastImport.generatedCount}</strong>
              <span>新生成内部卡密</span>
            </div>
            <div className="admin-summary-card">
              <strong>{lastImport.existingCount}</strong>
              <span>库内已存在</span>
            </div>
            <div className="admin-summary-card">
              <strong>{lastImport.duplicateInputCount}</strong>
              <span>输入内重复</span>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>上游卡密</th>
                  <th>内部卡密</th>
                  <th>结果</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {lastImport.items.map((item) => (
                  <tr key={`${item.upstreamCodeMasked}-${item.redeemCode ?? 'none'}`}>
                    <td>
                      <code>{item.upstreamCodeMasked}</code>
                    </td>
                    <td>{item.redeemCode ? <code>{item.redeemCode}</code> : '未生成'}</td>
                    <td>
                      <span className="admin-badge">{getResultStatusLabel(item.status)}</span>
                    </td>
                    <td>{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="admin-layout">
        <aside className="redeem-side-card admin-batch-panel">
          <div className="redeem-card-header">
            <span className="redeem-kicker">最近批次</span>
            <h2>选择一个批次</h2>
            <p>点击左侧批次，右侧会切换到这一批次对应的卡密库存。</p>
          </div>

          <div className="admin-batch-list">
            {batches.length ? (
              batches.map((batch) => {
                const isActive = batch.batchNo === selectedBatchNo;

                return (
                  <button
                    className={`admin-batch-item${isActive ? ' admin-batch-item-active' : ''}`}
                    key={batch.batchNo}
                    type="button"
                    onClick={() => void handleBatchSelect(batch.batchNo)}
                  >
                    <strong>{batch.batchNo}</strong>
                    <span>{batch.productName}</span>
                    <span>
                      数量 {batch.quantity} / 已发码 {batch.generatedCount} / 库存中 {batch.inStockCount}
                    </span>
                    <span>{formatDateTime(batch.createdAt)}</span>
                  </button>
                );
              })
            ) : (
              <div className="admin-empty-state">还没有批量导入记录。</div>
            )}
          </div>
        </aside>

        <div className="redeem-card admin-inventory-card">
          <div className="redeem-card-header">
            <span className="redeem-kicker">库存</span>
            <h2>
              {selectedBatch ? `${selectedBatch.batchNo} 的卡密列表` : '当前库存'}
            </h2>
            <p>
              {selectedBatch
                ? `当前批次共 ${filteredInventory.length} 张卡密，右侧列表展示这一批次的上游卡密与内部卡密绑定情况。`
                : '当前展示最近的库存记录。'}
            </p>
          </div>

          {selectedBatch ? (
            <div className="admin-summary-grid admin-summary-grid-compact">
              <div className="admin-summary-card">
                <strong>{selectedBatch.quantity}</strong>
                <span>导入数量</span>
              </div>
              <div className="admin-summary-card">
                <strong>{selectedBatch.generatedCount}</strong>
                <span>已生成内部卡密</span>
              </div>
              <div className="admin-summary-card">
                <strong>{selectedBatch.inStockCount}</strong>
                <span>仍在库存中</span>
              </div>
              <div className="admin-summary-card">
                <strong>{selectedBatch.supplierName || '未填'}</strong>
                <span>供应商</span>
              </div>
            </div>
          ) : null}

          {!inventoryLoading && !filteredInventory.length ? (
            <div className="admin-empty-state">当前批次下还没有可展示的卡密记录。</div>
          ) : null}
          {inventoryLoading ? (
            <div className="admin-empty-state">正在切换批次并加载卡密列表...</div>
          ) : null}

          <div className="admin-table-wrap admin-table-wrap-tall">
            <table className="admin-table admin-table-inventory">
              <thead>
                <tr>
                  <th>批次</th>
                  <th>商品</th>
                  <th>上游卡密</th>
                  <th>内部卡密</th>
                  <th>上游状态</th>
                  <th>内部状态</th>
                  <th>导入时间</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => (
                  <tr key={`${item.batchNo ?? 'none'}-${item.upstreamCodeMasked}-${item.createdAt}`}>
                    <td>{item.batchNo ?? '历史数据'}</td>
                    <td>{item.productName}</td>
                    <td>
                      <code>{item.upstreamCodeMasked}</code>
                    </td>
                    <td>{item.redeemCode ? <code>{item.redeemCode}</code> : '未生成'}</td>
                    <td>{getInventoryStatusLabel(item.upstreamStatus)}</td>
                    <td>{item.redeemStatus ? getInventoryStatusLabel(item.redeemStatus) : '未生成'}</td>
                    <td>{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="redeem-side-card admin-notes-card">
        <span className="redeem-kicker">说明</span>
        <h2>当前行为</h2>
        <ul className="admin-notes">
          <li>默认按上游卡密去重，重复导入不会重复建库存。</li>
          <li>勾选“立即生成”时，会同步生成内部兑换码并绑定到该上游卡密。</li>
          <li>右侧库存默认展示当前选中批次，便于连续检查一整批卡密。</li>
          <li>后台登录和权限控制还没接入，这一页先作为本地管理入口使用。</li>
        </ul>
      </section>
    </div>
  );
}
