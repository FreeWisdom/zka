import { getDatabase } from '@/lib/storage/database';

import { RedeemRequestLookupError } from './errors';
import type { RedeemRequestStatus, RedeemStatusResult, UpstreamLookupResult } from './types';
import { lookupBoundUpstreamCode } from './upstream-adapter';

const PROCESSING_REFRESH_WINDOW_MS = 30_000;

type RedeemStatusRow = {
  requestId: string;
  requestNo: string;
  redeemCodeId: string;
  upstreamCodeId: string;
  status: RedeemStatusResult['status'];
  errorMessage: string | null;
  lastCheckedAt: string | null;
  upstreamCodeEncrypted: string;
};

type GetRedeemStatusOptions = {
  refreshIfProcessing?: boolean;
};

type RedeemStatusOverrides = {
  status?: RedeemRequestStatus;
  statusHint?: string;
  message?: string | null;
};

function mapStatusHint(row: Pick<RedeemStatusRow, 'status' | 'errorMessage'>) {
  switch (row.status) {
    case 'processing':
      return '处理中，请稍后刷新';
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

function buildRedeemStatusResult(
  row: RedeemStatusRow,
  overrides: RedeemStatusOverrides = {},
): RedeemStatusResult {
  const status = overrides.status ?? row.status;
  const message =
    'message' in overrides ? overrides.message ?? undefined : row.errorMessage ?? undefined;

  return {
    requestNo: row.requestNo,
    status,
    statusHint:
      overrides.statusHint ??
      mapStatusHint({
        status,
        errorMessage: message ?? null,
      }),
    retryable: status === 'failed_retryable',
    message,
  };
}

function isRefreshBlocked(lastCheckedAt: string | null) {
  if (!lastCheckedAt) {
    return false;
  }

  const lastCheckedAtMs = new Date(lastCheckedAt).getTime();

  if (Number.isNaN(lastCheckedAtMs)) {
    return false;
  }

  return Date.now() - lastCheckedAtMs < PROCESSING_REFRESH_WINDOW_MS;
}

function isRetryableLookup(lookup: UpstreamLookupResult) {
  if (lookup.useStatus === -1) {
    return false;
  }

  if (lookup.message.includes('处理中') || lookup.message.includes('正在')) {
    return false;
  }

  return (
    lookup.useStatus === -9 ||
    lookup.useStatus === 0 ||
    lookup.inCooldown === true ||
    lookup.message.includes('稍后') ||
    lookup.message.includes('再试') ||
    lookup.message.includes('库存不足')
  );
}

function isInvalidLookup(lookup: UpstreamLookupResult) {
  return (
    lookup.useStatus === -999 ||
    lookup.useStatus === -1000 ||
    lookup.message.includes('不存在') ||
    lookup.message.includes('异常') ||
    lookup.message.includes('作废') ||
    lookup.message.includes('不可用')
  );
}

function createLookupSnapshot(lookup: UpstreamLookupResult) {
  return JSON.stringify({
    success: lookup.success,
    message: lookup.message,
    giftName: lookup.giftName ?? null,
    useStatus: lookup.useStatus ?? null,
    statusHint: lookup.statusHint ?? null,
    accountEmail: lookup.accountEmail ?? null,
    completedAt: lookup.completedAt ?? null,
    inCooldown: lookup.inCooldown ?? null,
    cooldownRemaining: lookup.cooldownRemaining ?? null,
  });
}

function persistProcessingRefresh(
  row: RedeemStatusRow,
  input: {
    now: string;
    lookup: UpstreamLookupResult;
  },
) {
  const db = getDatabase();

  db.prepare(
    `
      UPDATE redeem_requests
      SET
        upstream_status_code = ?,
        upstream_response = ?,
        last_checked_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
  ).run(
    input.lookup.useStatus ?? null,
    createLookupSnapshot(input.lookup),
    input.now,
    input.now,
    row.requestId,
  );
}

function persistResolvedRefresh(
  row: RedeemStatusRow,
  input: {
    now: string;
    lookup: UpstreamLookupResult;
    requestStatus: RedeemRequestStatus;
    redeemCodeStatus: 'success' | 'failed';
    upstreamStatus: 'success' | 'bound' | 'invalid';
    errorMessage: string | null;
    completedAt: string | null;
  },
) {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    db.prepare(
      `
        UPDATE redeem_requests
        SET
          status = ?,
          upstream_status_code = ?,
          upstream_response = ?,
          error_message = ?,
          completed_at = ?,
          last_checked_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
    ).run(
      input.requestStatus,
      input.lookup.useStatus ?? null,
      createLookupSnapshot(input.lookup),
      input.errorMessage,
      input.completedAt,
      input.now,
      input.now,
      row.requestId,
    );

    db.prepare(
      `
        UPDATE redeem_codes
        SET
          status = ?,
          redeemed_at = ?,
          last_error_message = ?,
          updated_at = ?
        WHERE id = ?
      `,
    ).run(
      input.redeemCodeStatus,
      input.requestStatus === 'success' ? input.completedAt : null,
      input.errorMessage,
      input.now,
      row.redeemCodeId,
    );

    db.prepare(
      `
        UPDATE upstream_codes
        SET
          status = ?,
          activated_at = ?,
          invalid_at = ?,
          last_error_message = ?,
          updated_at = ?
        WHERE id = ?
      `,
    ).run(
      input.upstreamStatus,
      input.upstreamStatus === 'success' ? input.completedAt : null,
      input.upstreamStatus === 'invalid' ? input.now : null,
      input.errorMessage,
      input.now,
      row.upstreamCodeId,
    );
  });

  transaction();
}

async function refreshProcessingStatus(row: RedeemStatusRow): Promise<RedeemStatusResult> {
  if (isRefreshBlocked(row.lastCheckedAt)) {
    return buildRedeemStatusResult(row, {
      statusHint: '处理中，已在最近 30 秒内查询过，请稍后再试',
      message: null,
    });
  }

  const now = new Date().toISOString();
  const lookup = await lookupBoundUpstreamCode({
    upstreamCodeEncrypted: row.upstreamCodeEncrypted,
  });

  if (lookup.useStatus === 1) {
    const completedAt = lookup.completedAt ?? now;

    persistResolvedRefresh(row, {
      now,
      lookup,
      requestStatus: 'success',
      redeemCodeStatus: 'success',
      upstreamStatus: 'success',
      errorMessage: null,
      completedAt,
    });

    return buildRedeemStatusResult(
      {
        ...row,
        status: 'success',
        errorMessage: null,
        lastCheckedAt: now,
      },
      {
        status: 'success',
        message: null,
      },
    );
  }

  if (isRetryableLookup(lookup)) {
    const isAvailableAgain = lookup.useStatus === 0;
    const message = lookup.statusHint ?? lookup.message;

    persistResolvedRefresh(row, {
      now,
      lookup,
      requestStatus: 'failed_retryable',
      redeemCodeStatus: 'failed',
      upstreamStatus: 'bound',
      errorMessage: message,
      completedAt: now,
    });

    return buildRedeemStatusResult(
      {
        ...row,
        status: 'failed_retryable',
        errorMessage: message,
        lastCheckedAt: now,
      },
      {
        status: 'failed_retryable',
        message,
        statusHint: isAvailableAgain ? '本次兑换未完成，当前可重新提交' : undefined,
      },
    );
  }

  if (isInvalidLookup(lookup)) {
    const message = lookup.statusHint ?? lookup.message;

    persistResolvedRefresh(row, {
      now,
      lookup,
      requestStatus: 'failed_final',
      redeemCodeStatus: 'failed',
      upstreamStatus: 'invalid',
      errorMessage: message,
      completedAt: now,
    });

    return buildRedeemStatusResult(
      {
        ...row,
        status: 'failed_final',
        errorMessage: message,
        lastCheckedAt: now,
      },
      {
        status: 'failed_final',
        message,
      },
    );
  }

  persistProcessingRefresh(row, {
    now,
    lookup,
  });

  if (lookup.useStatus === -1) {
    return buildRedeemStatusResult(
      {
        ...row,
        lastCheckedAt: now,
      },
      {
        statusHint: lookup.statusHint ?? lookup.message ?? '处理中，请稍后刷新',
        message: null,
      },
    );
  }

  return buildRedeemStatusResult(
    {
      ...row,
      lastCheckedAt: now,
    },
    {
      statusHint: '处理中，状态刷新失败，请稍后再试',
      message: lookup.message,
    },
  );
}

export async function getRedeemStatus(
  requestNo: string,
  options: GetRedeemStatusOptions = {},
): Promise<RedeemStatusResult> {
  const db = getDatabase();
  const row = db
    .prepare<
      [string],
      RedeemStatusRow
    >(
      `
        SELECT
          rr.id AS requestId,
          rr.request_no AS requestNo,
          rr.redeem_code_id AS redeemCodeId,
          rc.upstream_code_id AS upstreamCodeId,
          rr.status AS status,
          rr.error_message AS errorMessage,
          rr.last_checked_at AS lastCheckedAt,
          uc.upstream_code_encrypted AS upstreamCodeEncrypted
        FROM redeem_requests rr
        INNER JOIN redeem_codes rc ON rc.id = rr.redeem_code_id
        INNER JOIN upstream_codes uc ON uc.id = rc.upstream_code_id
        WHERE rr.request_no = ?
      `,
    )
    .get(requestNo);

  if (!row) {
    throw new RedeemRequestLookupError('兑换请求不存在');
  }

  if (options.refreshIfProcessing && row.status === 'processing') {
    return refreshProcessingStatus(row);
  }

  return buildRedeemStatusResult(row);
}
