import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

import { getServerEnv } from '@/lib/config/env';

const ENCRYPTED_PREFIX = 'enc:v1';
const IV_LENGTH = 12;

type LegacyUpstreamCodeRow = {
  id: string;
  upstream_code_encrypted: string;
};

type LegacyMigrationClient = {
  prepare: <Params extends unknown[], Row>(
    query: string,
  ) => {
    all: (...params: Params) => Promise<Row[]> | Row[];
    run: (...params: Params) => Promise<unknown> | unknown;
  };
  transaction: <Args extends unknown[], Result>(
    callback: (...args: Args) => Promise<Result> | Result,
  ) => (...args: Args) => Promise<Result> | Result;
};

export function normalizeUpstreamCode(value: string) {
  return value.trim().toUpperCase();
}

function getEncryptionKey() {
  const configuredKey = getServerEnv().cardEncryptionKey;

  if (!configuredKey) {
    throw new Error('CARD_ENCRYPTION_KEY 未配置，无法加密或解密上游卡密');
  }

  return createHash('sha256').update(configuredKey).digest();
}

function decodeLegacyUpstreamCode(encodedValue: string) {
  return Buffer.from(encodedValue, 'base64').toString('utf8');
}

export function isEncryptedUpstreamCode(value: string) {
  return value.startsWith(`${ENCRYPTED_PREFIX}:`);
}

export function encodeUpstreamCode(value: string) {
  const normalizedValue = normalizeUpstreamCode(value);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(normalizedValue, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decodeUpstreamCode(encodedValue: string) {
  if (!isEncryptedUpstreamCode(encodedValue)) {
    return decodeLegacyUpstreamCode(encodedValue);
  }

  const [, , ivValue, authTagValue, encryptedValue] = encodedValue.split(':');

  if (!ivValue || !authTagValue || !encryptedValue) {
    throw new Error('上游卡密密文格式无效');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivValue, 'base64url'),
  );

  decipher.setAuthTag(Buffer.from(authTagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function tryDecodeUpstreamCode(encodedValue: string) {
  try {
    return decodeUpstreamCode(encodedValue);
  } catch {
    return null;
  }
}

export function maskStoredUpstreamCode(encodedValue: string) {
  const decodedValue = tryDecodeUpstreamCode(encodedValue);

  return decodedValue ? maskUpstreamCode(decodedValue) : '[解密失败]';
}

export function hashUpstreamCode(value: string) {
  return createHash('sha256').update(normalizeUpstreamCode(value)).digest('hex');
}

export function maskUpstreamCode(value: string) {
  const normalizedValue = normalizeUpstreamCode(value);

  if (normalizedValue.length <= 8) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 4)}****${normalizedValue.slice(-4)}`;
}

export async function migrateLegacyUpstreamCodeStorage(db: LegacyMigrationClient) {
  const legacyRows = (
    await db
      .prepare<[], LegacyUpstreamCodeRow>(
        `
          SELECT id, upstream_code_encrypted
          FROM upstream_codes
        `,
      )
      .all()
  ).filter((row) => !isEncryptedUpstreamCode(row.upstream_code_encrypted));

  if (!legacyRows.length || !getServerEnv().cardEncryptionKey) {
    return;
  }

  const now = new Date().toISOString();
  const updateStatement = db.prepare(
    `
      UPDATE upstream_codes
      SET
        upstream_code_encrypted = ?,
        updated_at = ?
      WHERE id = ?
    `,
  );

  const transaction = db.transaction(async () => {
    for (const row of legacyRows) {
      await updateStatement.run(
        encodeUpstreamCode(decodeLegacyUpstreamCode(row.upstream_code_encrypted)),
        now,
        row.id,
      );
    }
  });

  await transaction();
}
