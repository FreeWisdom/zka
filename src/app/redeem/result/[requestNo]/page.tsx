import Link from 'next/link';
import { notFound } from 'next/navigation';

import { RedeemRequestLookupError } from '@/lib/redeem/errors';
import { getRedeemStatus } from '@/lib/redeem/get-redeem-status';

type RedeemResultPageProps = {
  params: Promise<{
    requestNo: string;
  }>;
  searchParams: Promise<{
    refresh?: string;
  }>;
};

function statusLabel(status: string) {
  switch (status) {
    case 'processing':
      return '处理中';
    case 'success':
      return '已完成';
    case 'failed_retryable':
      return '可重试失败';
    case 'failed_final':
      return '最终失败';
    default:
      return status;
  }
}

export default async function RedeemResultPage({
  params,
  searchParams,
}: RedeemResultPageProps) {
  const { requestNo } = await params;
  const { refresh } = await searchParams;
  let result;

  try {
    result = await getRedeemStatus(requestNo, {
      refreshIfProcessing: refresh === '1',
    });
  } catch (error) {
    if (error instanceof RedeemRequestLookupError) {
      notFound();
    }

    throw error;
  }

  return (
    <main className="redeem-shell">
      <section className="redeem-result-card">
        <span className="redeem-kicker">Redeem Result</span>
        <h1>兑换请求结果</h1>
        <p>{result.statusHint}</p>

        <div className="redeem-result-meta">
          <span className="redeem-pill">{statusLabel(result.status)}</span>
          <code>{result.requestNo}</code>
        </div>

        {result.message ? (
          <p className="redeem-result-detail">详细信息：{result.message}</p>
        ) : null}

        <div className="redeem-actions">
          <Link className="redeem-button" href="/redeem">
            返回兑换页
          </Link>
          <Link
            className="redeem-button redeem-button-secondary"
            href={`/redeem/result/${result.requestNo}?refresh=1`}
          >
            刷新状态
          </Link>
        </div>
      </section>
    </main>
  );
}
