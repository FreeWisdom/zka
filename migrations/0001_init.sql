CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id TEXT PRIMARY KEY,
  batch_no TEXT NOT NULL UNIQUE,
  supplier_name TEXT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  remark TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS upstream_codes (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_id TEXT REFERENCES inventory_batches(id) ON DELETE SET NULL,
  upstream_code_encrypted TEXT NOT NULL,
  upstream_code_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  last_error_message TEXT,
  activated_at TEXT,
  invalid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redeem_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  upstream_code_id TEXT NOT NULL UNIQUE REFERENCES upstream_codes(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  submitted_at TEXT,
  redeemed_at TEXT,
  locked_at TEXT,
  last_error_message TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redeem_requests (
  id TEXT PRIMARY KEY,
  request_no TEXT NOT NULL UNIQUE,
  redeem_code_id TEXT NOT NULL REFERENCES redeem_codes(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL,
  retry_of_request_id TEXT REFERENCES redeem_requests(id),
  session_info_masked TEXT NOT NULL,
  session_info_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  upstream_status_code INTEGER,
  upstream_response TEXT,
  error_message TEXT,
  submitted_at TEXT NOT NULL,
  completed_at TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (redeem_code_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_upstream_codes_product_status
  ON upstream_codes (product_id, status);

CREATE INDEX IF NOT EXISTS idx_upstream_codes_batch_created
  ON upstream_codes (batch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_status_issued
  ON redeem_codes (status, issued_at);

CREATE INDEX IF NOT EXISTS idx_redeem_requests_status_created
  ON redeem_requests (status, created_at);

CREATE INDEX IF NOT EXISTS idx_redeem_requests_session_hash
  ON redeem_requests (session_info_hash);
