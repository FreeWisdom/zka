import { getDatabase } from '@/lib/storage/database';

import { RedeemRequestLookupError } from './errors';
import type { RedeemStatusResult } from './types';

type RedeemStatusRow = {
  requestNo: string;
  status: RedeemStatusResult['status'];
  errorMessage: string | null;
};

function mapStatusHint(row: RedeemStatusRow) {
  switch (row.status) {
    case 'processing':
      return '上游处理中，请稍后刷新';
    case 'success':
      return '兑换成功，请登录账号查看结果';
    case 'failed_retryable':
      return '本次兑换失败，可稍后重试';
    case 'failed_final':
      return row.errorMessage ?? '本次兑换失败，请检查输入信息后重新提交';
    default:
      return '请求已提交，请稍后刷新';
  }
}

export async function getRedeemStatus(
  requestNo: string,
): Promise<RedeemStatusResult> {
  const db = getDatabase();
  const row = db
    .prepare<
      [string],
      RedeemStatusRow
    >(
      `
        SELECT
          request_no AS requestNo,
          status AS status,
          error_message AS errorMessage
        FROM redeem_requests
        WHERE request_no = ?
      `,
    )
    .get(requestNo);

  if (!row) {
    throw new RedeemRequestLookupError('兑换请求不存在');
  }

  return {
    requestNo: row.requestNo,
    status: row.status,
    statusHint: mapStatusHint(row),
    retryable: row.status === 'failed_retryable',
    message: row.errorMessage ?? undefined,
  };
}
