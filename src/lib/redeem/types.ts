export type RedeemCodeStatus =
  | 'unused'
  | 'submitted'
  | 'success'
  | 'failed'
  | 'locked';

export type UpstreamCodeStatus =
  | 'in_stock'
  | 'reserved'
  | 'bound'
  | 'submitted'
  | 'success'
  | 'failed'
  | 'invalid';

export type RedeemRequestStatus =
  | 'submitted'
  | 'processing'
  | 'success'
  | 'failed_retryable'
  | 'failed_final';

export type UpstreamLookupResult = {
  success: boolean;
  codeMasked: string;
  message: string;
  giftName?: string;
  useStatus?: number;
  statusHint?: string;
  accountEmail?: string;
  completedAt?: string;
  inCooldown?: boolean;
  cooldownRemaining?: number;
};

export type CheckCodeResult = {
  code: string;
  status: RedeemCodeStatus;
  canSubmit: boolean;
  productName: string;
  message: string;
  upstreamCodeMasked: string;
  upstreamLookup: UpstreamLookupResult;
};

export type SubmitRedeemInput = {
  code: string;
  sessionInfo: string;
  force?: boolean;
};

export type SubmitRedeemResult = {
  requestNo: string;
  status: RedeemRequestStatus;
  retryable: boolean;
  message: string;
};

export type RedeemStatusResult = {
  requestNo: string;
  status: RedeemRequestStatus;
  statusHint: string;
  retryable: boolean;
  message?: string;
};

export type NormalizedUpstreamResult = {
  ok: boolean;
  state: RedeemRequestStatus;
  retryable: boolean;
  message: string;
  upstreamStatus: UpstreamCodeStatus;
  upstreamStatusCode?: number;
  completedAt?: string;
  raw: unknown;
};

export type SessionInfoSnapshot = {
  hash: string;
  masked: string;
  accountId?: string;
  planType?: string;
  email?: string;
  errorMessage?: string;
};

export type PairRedeemCodeInput = {
  upstreamCode: string;
  productName?: string;
  productSlug?: string;
  productDescription?: string;
};

export type PairRedeemCodeResult = {
  code: string;
  created: boolean;
  productName: string;
  upstreamCodeMasked: string;
  upstreamLookup: UpstreamLookupResult;
};
