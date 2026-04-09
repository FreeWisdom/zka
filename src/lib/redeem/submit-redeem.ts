import { randomUUID } from 'node:crypto';

import { getDatabase } from '@/lib/storage/database';

import { checkRedeemCode } from './check-code';
import { RedeemCodeLookupError, RedeemSubmitError } from './errors';
import { analyzeSessionInfo } from './session-info';
import type {
  RedeemRequestStatus,
  SubmitRedeemInput,
  SubmitRedeemResult,
  UpstreamCodeStatus,
} from './types';
import { activateUpstreamCode } from './upstream-adapter';

type RedeemSubmitLookupRow = {
  redeemCodeId: string;
  upstreamCodeId: string;
  upstreamCodeEncrypted: string;
};

type LastRequestRow = {
  id: string;
  attempt_no: number;
};

function createRequestNo() {
  return `REQ${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
}

function mapRedeemCodeStatus(status: RedeemRequestStatus) {
  if (status === 'success') {
    return 'success';
  }

  if (status === 'processing') {
    return 'submitted';
  }

  return 'failed';
}

function mapUpstreamMetadata(input: {
  status: RedeemRequestStatus;
  upstreamStatus: UpstreamCodeStatus;
  message: string;
  completedAt?: string;
}) {
  return {
    status: input.upstreamStatus,
    activatedAt:
      input.status === 'success' ? input.completedAt ?? new Date().toISOString() : null,
    invalidAt: input.upstreamStatus === 'invalid' ? new Date().toISOString() : null,
    lastErrorMessage:
      input.status === 'success' || input.status === 'processing' ? null : input.message,
  };
}

function mapRedeemMetadata(input: {
  status: RedeemRequestStatus;
  message: string;
  completedAt?: string;
}) {
  const submittedAt = new Date().toISOString();

  return {
    status: mapRedeemCodeStatus(input.status),
    submittedAt,
    redeemedAt: input.status === 'success' ? input.completedAt ?? submittedAt : null,
    lastErrorMessage:
      input.status === 'success' || input.status === 'processing' ? null : input.message,
  };
}

export async function submitRedeem(
  input: SubmitRedeemInput,
): Promise<SubmitRedeemResult> {
  const db = getDatabase();
  const normalizedCode = input.code.trim().toUpperCase();
  const checkResult = await checkRedeemCode(normalizedCode);

  if (!checkResult.canSubmit) {
    throw new RedeemSubmitError(checkResult.message);
  }

  const redeemRow = db
    .prepare<
      [string],
      RedeemSubmitLookupRow
    >(
      `
        SELECT
          rc.id AS redeemCodeId,
          uc.id AS upstreamCodeId,
          uc.upstream_code_encrypted AS upstreamCodeEncrypted
        FROM redeem_codes rc
        INNER JOIN upstream_codes uc ON uc.id = rc.upstream_code_id
        WHERE rc.code = ?
      `,
    )
    .get(normalizedCode);

  if (!redeemRow) {
    throw new RedeemCodeLookupError('兑换码不存在');
  }

  const lastRequest = db
    .prepare<
      [string],
      LastRequestRow
    >(
      `
        SELECT id, attempt_no
        FROM redeem_requests
        WHERE redeem_code_id = ?
        ORDER BY attempt_no DESC
        LIMIT 1
      `,
    )
    .get(redeemRow.redeemCodeId);
  const attemptNo = (lastRequest?.attempt_no ?? 0) + 1;
  const requestNo = createRequestNo();
  const requestId = randomUUID();
  const sessionInfo = analyzeSessionInfo(input.sessionInfo);
  const upstreamResult = await activateUpstreamCode({
    upstreamCodeEncrypted: redeemRow.upstreamCodeEncrypted,
    sessionInfo,
    sessionInfoRaw: input.sessionInfo,
  });
  const now = new Date().toISOString();
  const redeemMetadata = mapRedeemMetadata({
    status: upstreamResult.state,
    message: upstreamResult.message,
    completedAt: upstreamResult.completedAt,
  });
  const upstreamMetadata = mapUpstreamMetadata({
    status: upstreamResult.state,
    upstreamStatus: upstreamResult.upstreamStatus,
    message: upstreamResult.message,
    completedAt: upstreamResult.completedAt,
  });

  const transaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO redeem_requests (
          id,
          request_no,
          redeem_code_id,
          attempt_no,
          retry_of_request_id,
          session_info_masked,
          session_info_hash,
          status,
          upstream_status_code,
          upstream_response,
          error_message,
          submitted_at,
          completed_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      requestId,
      requestNo,
      redeemRow.redeemCodeId,
      attemptNo,
      lastRequest?.id ?? null,
      sessionInfo.masked,
      sessionInfo.hash,
      upstreamResult.state,
      upstreamResult.upstreamStatusCode ?? null,
      JSON.stringify(upstreamResult.raw),
      upstreamResult.state === 'success' ? null : upstreamResult.message,
      now,
      upstreamResult.state === 'processing' ? null : upstreamResult.completedAt ?? now,
      now,
      now,
    );

    db.prepare(
      `
        UPDATE redeem_codes
        SET
          status = ?,
          submitted_at = ?,
          redeemed_at = ?,
          last_error_message = ?,
          updated_at = ?
        WHERE id = ?
      `,
    ).run(
      redeemMetadata.status,
      redeemMetadata.submittedAt,
      redeemMetadata.redeemedAt,
      redeemMetadata.lastErrorMessage,
      now,
      redeemRow.redeemCodeId,
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
      upstreamMetadata.status,
      upstreamMetadata.activatedAt,
      upstreamMetadata.invalidAt,
      upstreamMetadata.lastErrorMessage,
      now,
      redeemRow.upstreamCodeId,
    );
  });

  transaction();

  return {
    requestNo,
    status: upstreamResult.state,
    retryable: upstreamResult.retryable,
    message: upstreamResult.message,
  };
}
