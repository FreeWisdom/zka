const DEFAULT_DATABASE_PATH = './data/platform-b.db';

function readEnvValue(name: string) {
  const value = process.env[name]?.trim();

  return value ? value : undefined;
}

export function getDatabasePath() {
  return readEnvValue('DATABASE_PATH') ?? DEFAULT_DATABASE_PATH;
}

export function getRuntimeDatabaseUrl() {
  return readEnvValue('DATABASE_URL') ?? readEnvValue('POSTGRES_URL');
}

export function getMigrationDatabaseUrl() {
  return (
    readEnvValue('MIGRATION_DATABASE_URL') ??
    readEnvValue('POSTGRES_URL_NON_POOLING') ??
    getRuntimeDatabaseUrl()
  );
}

export function getServerEnv() {
  const upstreamBaseUrl = readEnvValue('UPSTREAM_BASE_URL');
  const upstreamApiKey = readEnvValue('UPSTREAM_API_KEY');
  const alipayAppId = readEnvValue('ALIPAY_APP_ID');
  const alipayPrivateKey = readEnvValue('ALIPAY_PRIVATE_KEY');
  const alipayPublicKey = readEnvValue('ALIPAY_PUBLIC_KEY');
  const alipayNotifyUrl = readEnvValue('ALIPAY_NOTIFY_URL');

  return {
    nodeEnv: readEnvValue('NODE_ENV') ?? 'development',
    databasePath: getDatabasePath(),
    databaseUrlConfigured: Boolean(getRuntimeDatabaseUrl()),
    migrationDatabaseUrlConfigured: Boolean(getMigrationDatabaseUrl()),
    adminPassword: readEnvValue('ADMIN_PASSWORD'),
    upstreamBaseUrl,
    upstreamApiKey,
    cardEncryptionKey: readEnvValue('CARD_ENCRYPTION_KEY'),
    adminAllowedIps:
      readEnvValue('ADMIN_ALLOWED_IPS')
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean) ?? [],
    alipayAppId,
    alipayPrivateKey,
    alipayPublicKey,
    alipayNotifyUrl,
    upstreamConfigured: Boolean(upstreamBaseUrl),
    alipayConfigured: Boolean(
      alipayAppId && alipayPrivateKey && alipayPublicKey && alipayNotifyUrl,
    ),
  };
}

export function getEnvHealthSummary() {
  const env = getServerEnv();

  return {
    nodeEnv: env.nodeEnv,
    databasePath: env.databasePath,
    databaseUrlConfigured: env.databaseUrlConfigured,
    migrationDatabaseUrlConfigured: env.migrationDatabaseUrlConfigured,
    adminPasswordConfigured: Boolean(env.adminPassword),
    upstreamConfigured: env.upstreamConfigured,
    cardEncryptionKeyConfigured: Boolean(env.cardEncryptionKey),
    alipayConfigured: env.alipayConfigured,
  };
}
