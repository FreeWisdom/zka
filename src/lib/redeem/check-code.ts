import { getDatabase } from '@/lib/storage/database';

import { RedeemCodeLookupError } from './errors';
import { lookupBoundUpstreamCode } from './upstream-adapter';
import type {
  CheckCodeResult,
  RedeemCodeStatus,
  UpstreamCodeStatus,
} from './types';

type RedeemCodeLookupRow = {
  code: string;
  redeemStatus: RedeemCodeStatus;
  upstreamStatus: UpstreamCodeStatus;
  productName: string;
  upstreamCodeEncrypted: string;
};

function mapCheckCodeState(
  row: RedeemCodeLookupRow,
): Pick<CheckCodeResult, 'canSubmit' | 'message'> {
  if (row.redeemStatus === 'unused' && row.upstreamStatus === 'bound') {
    return {
      canSubmit: true,
      message: '兑换码可用',
    };
  }

  if (row.redeemStatus === 'failed' && row.upstreamStatus === 'bound') {
    return {
      canSubmit: true,
      message: '兑换码可重试',
    };
  }

  if (row.redeemStatus === 'submitted' || row.upstreamStatus === 'submitted') {
    return {
      canSubmit: false,
      message: '兑换请求处理中',
    };
  }

  if (row.redeemStatus === 'success') {
    return {
      canSubmit: false,
      message: '兑换码已使用',
    };
  }

  if (row.redeemStatus === 'locked') {
    return {
      canSubmit: false,
      message: '兑换码已锁定',
    };
  }

  if (row.upstreamStatus === 'invalid') {
    return {
      canSubmit: false,
      message: '兑换码当前不可用，请联系管理员',
    };
  }

  return {
    canSubmit: false,
    message: '兑换码当前不可提交',
  };
}

export async function checkRedeemCode(code: string): Promise<CheckCodeResult> {
  const db = getDatabase();
  const normalizedCode = code.trim().toUpperCase();
  const row = await db
    .prepare<
      [string],
      RedeemCodeLookupRow
    >(
      `
        SELECT
          rc.code AS code,
          rc.status AS redeemStatus,
          uc.status AS upstreamStatus,
          p.name AS productName,
          uc.upstream_code_encrypted AS upstreamCodeEncrypted
        FROM redeem_codes rc
        INNER JOIN upstream_codes uc ON uc.id = rc.upstream_code_id
        INNER JOIN products p ON p.id = rc.product_id
        WHERE rc.code = ?
      `,
    )
    .get(normalizedCode);

  if (!row) {
    throw new RedeemCodeLookupError('兑换码不存在');
  }

  const mappedState = mapCheckCodeState(row);
  const upstreamLookup = await lookupBoundUpstreamCode({
    upstreamCodeEncrypted: row.upstreamCodeEncrypted,
  });

  return {
    code: row.code,
    status: row.redeemStatus,
    productName: row.productName,
    upstreamCodeMasked: upstreamLookup.codeMasked,
    upstreamLookup,
    ...mappedState,
  };
}
