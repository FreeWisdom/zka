import { randomUUID } from 'node:crypto';

import { getDatabase } from '@/lib/storage/database';

import { RedeemCodeLookupError, RedeemSubmitError } from './errors';
import { analyzeSessionInfo } from './session-info';
import type {
  NormalizedUpstreamResult,
  RedeemCodeStatus,
  RedeemRequestStatus,
  SubmitRedeemInput,
  SubmitRedeemResult,
  UpstreamCodeStatus,
} from './types';
import { activateUpstreamCode } from './upstream-adapter';

type RedeemSubmitLookupRow = {
  redeemCodeId: string;
  redeemStatus: RedeemCodeStatus;
  upstreamCodeId: string;
  upstreamStatus: UpstreamCodeStatus;
  upstreamCodeEncrypted: string;
};

type LastRequestRow = {
  id: string;
  requestNo: string;
  status: RedeemRequestStatus;
  errorMessage: string | null;
  attemptNo: number;
};

type ReservedRedeemSubmission = {
  kind: 'reserved';
  redeemCodeId: string;
  upstreamCodeId: string;
  upstreamCodeEncrypted: string;
  requestId: string;
  requestNo: string;
};

type ExistingRedeemSubmission = {
  kind: 'existing';
  result: SubmitRedeemResult;
};

type ReserveRedeemSubmissionResult =
  | ExistingRedeemSubmission
  | ReservedRedeemSubmission;

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

async function loadRedeemSubmitRow(code: string) {
  const db = getDatabase();

  return db
    .prepare<[string], RedeemSubmitLookupRow>(
      `
        SELECT
          rc.id AS redeemCodeId,
          rc.status AS redeemStatus,
          uc.id AS upstreamCodeId,
          uc.status AS upstreamStatus,
          uc.upstream_code_encrypted AS upstreamCodeEncrypted
        FROM redeem_codes rc
        INNER JOIN upstream_codes uc ON uc.id = rc.upstream_code_id
        WHERE rc.code = ?
      `,
    )
    .get(code);
}

async function loadLastRequest(redeemCodeId: string) {
  const db = getDatabase();

  return db
    .prepare<[string], LastRequestRow>(
      `
        SELECT
          id,
          request_no AS requestNo,
          status,
          error_message AS errorMessage,
          attempt_no AS attemptNo
        FROM redeem_requests
        WHERE redeem_code_id = ?
        ORDER BY attempt_no DESC
        LIMIT 1
      `,
    )
    .get(redeemCodeId);
}

function mapBlockedSubmitMessage(row: RedeemSubmitLookupRow) {
  if (row.redeemStatus === 'unused' && row.upstreamStatus === 'bound') {
    return null;
  }

  if (row.redeemStatus === 'failed' && row.upstreamStatus === 'bound') {
    return null;
  }

  if (row.redeemStatus === 'submitted' || row.upstreamStatus === 'submitted') {
    return '兑换请求处理中，请稍后刷新';
  }

  if (row.redeemStatus === 'success') {
    return '兑换码已使用';
  }

  if (row.redeemStatus === 'locked') {
    return '兑换码已锁定';
  }

  if (row.upstreamStatus === 'invalid') {
    return '兑换码当前不可用，请联系管理员';
  }

  return '兑换码当前不可提交';
}

function createExistingSubmissionResult(lastRequest: LastRequestRow | undefined) {
  if (!lastRequest) {
    return null;
  }

  if (lastRequest.status !== 'submitted' && lastRequest.status !== 'processing') {
    return null;
  }

  return {
    requestNo: lastRequest.requestNo,
    status: lastRequest.status,
    retryable: false,
    message: lastRequest.errorMessage ?? '兑换请求处理中，请稍后刷新',
  } satisfies SubmitRedeemResult;
}

function createExistingReservation(
  result: SubmitRedeemResult,
): ExistingRedeemSubmission {
  return {
    kind: 'existing',
    result,
  };
}

function createReservedReservation(input: Omit<ReservedRedeemSubmission, 'kind'>) {
  return {
    kind: 'reserved',
    ...input,
  } satisfies ReservedRedeemSubmission;
}

function reserveRedeemSubmission(input: {
  code: string;
  sessionInfoMasked: string;
  sessionInfoHash: string;
}): Promise<ReserveRedeemSubmissionResult> {
  const db = getDatabase();
  const transaction = db.transaction(async (transactionInput: typeof input) => {
    const row = await loadRedeemSubmitRow(transactionInput.code);

    if (!row) {
      throw new RedeemCodeLookupError('兑换码不存在');
    }

    const lastRequest = await loadLastRequest(row.redeemCodeId);
    const existingSubmission = createExistingSubmissionResult(lastRequest);

    if (existingSubmission) {
      return createExistingReservation(existingSubmission);
    }

    const blockedMessage = mapBlockedSubmitMessage(row);

    if (blockedMessage) {
      throw new RedeemSubmitError(blockedMessage);
    }

    const now = new Date().toISOString();
    const requestId = randomUUID();
    const requestNo = createRequestNo();
    const attemptNo = (lastRequest?.attemptNo ?? 0) + 1;
    const redeemUpdate = await db
      .prepare(
        `
          UPDATE redeem_codes
          SET
            status = ?,
            submitted_at = ?,
            redeemed_at = ?,
            last_error_message = ?,
            updated_at = ?
          WHERE id = ?
            AND status IN ('unused', 'failed')
        `,
      )
      .run('submitted', now, null, null, now, row.redeemCodeId);
    const upstreamUpdate = await db
      .prepare(
        `
          UPDATE upstream_codes
          SET
            status = ?,
            activated_at = ?,
            invalid_at = ?,
            last_error_message = ?,
            updated_at = ?
          WHERE id = ?
            AND status = 'bound'
        `,
      )
      .run('submitted', null, null, null, now, row.upstreamCodeId);

    if (redeemUpdate.changes !== 1 || upstreamUpdate.changes !== 1) {
      const refreshedLastRequest = await loadLastRequest(row.redeemCodeId);
      const raceSubmission = createExistingSubmissionResult(refreshedLastRequest);

      if (raceSubmission) {
        return createExistingReservation(raceSubmission);
      }

      const refreshedRow = await loadRedeemSubmitRow(transactionInput.code);

      if (!refreshedRow) {
        throw new RedeemCodeLookupError('兑换码不存在');
      }

      throw new RedeemSubmitError(mapBlockedSubmitMessage(refreshedRow) ?? '兑换码当前不可提交');
    }

    await db.prepare(
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
      row.redeemCodeId,
      attemptNo,
      lastRequest?.id ?? null,
      transactionInput.sessionInfoMasked,
      transactionInput.sessionInfoHash,
      'submitted',
      null,
      null,
      null,
      now,
      null,
      now,
      now,
    );

    return createReservedReservation({
      redeemCodeId: row.redeemCodeId,
      upstreamCodeId: row.upstreamCodeId,
      upstreamCodeEncrypted: row.upstreamCodeEncrypted,
      requestId,
      requestNo,
    });
  });

  return transaction(input);
}

async function finalizeReservedRedeemSubmission(
  reservation: ReservedRedeemSubmission,
  upstreamResult: NormalizedUpstreamResult,
) {
  const db = getDatabase();
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

  await db.transaction(async () => {
    await db.prepare(
      `
        UPDATE redeem_requests
        SET
          status = ?,
          upstream_status_code = ?,
          upstream_response = ?,
          error_message = ?,
          completed_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
    ).run(
      upstreamResult.state,
      upstreamResult.upstreamStatusCode ?? null,
      JSON.stringify(upstreamResult.raw),
      upstreamResult.state === 'success' ? null : upstreamResult.message,
      upstreamResult.state === 'processing' ? null : upstreamResult.completedAt ?? now,
      now,
      reservation.requestId,
    );

    await db.prepare(
      `
        UPDATE redeem_codes
        SET
          status = ?,
          submitted_at = COALESCE(submitted_at, ?),
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
      reservation.redeemCodeId,
    );

    await db.prepare(
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
      reservation.upstreamCodeId,
    );
  })();
}

function createUnexpectedActivateResult(error: unknown): NormalizedUpstreamResult {
  const message = error instanceof Error ? error.message : '兑换失败，请稍后重试';

  return {
    ok: false,
    state: 'failed_retryable',
    retryable: true,
    message,
    upstreamStatus: 'bound',
    raw: {
      msg: message,
    },
  };
}

export async function submitRedeem(
  input: SubmitRedeemInput,
): Promise<SubmitRedeemResult> {
  const normalizedCode = input.code.trim().toUpperCase();
  const sessionInfo = analyzeSessionInfo(input.sessionInfo);
  const reservation = await reserveRedeemSubmission({
    code: normalizedCode,
    sessionInfoMasked: sessionInfo.masked,
    sessionInfoHash: sessionInfo.hash,
  });

  if (reservation.kind === 'existing') {
    return reservation.result;
  }

  let upstreamResult: NormalizedUpstreamResult;

  try {
    upstreamResult = await activateUpstreamCode({
      upstreamCodeEncrypted: reservation.upstreamCodeEncrypted,
      sessionInfo,
      sessionInfoRaw: input.sessionInfo,
    });
  } catch (error) {
    upstreamResult = createUnexpectedActivateResult(error);
  }

  await finalizeReservedRedeemSubmission(reservation, upstreamResult);

  return {
    requestNo: reservation.requestNo,
    status: upstreamResult.state,
    retryable: upstreamResult.retryable,
    message: upstreamResult.message,
  };
}
