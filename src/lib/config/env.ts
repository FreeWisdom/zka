const DEFAULT_DATABASE_PATH = './data/platform-b.db';

export type DatabaseProvider = 'postgres' | 'sqlite';

function readEnvValue(name: string) {
  const value = process.env[name]?.trim();

  return value ? value : undefined;
}

function readBooleanEnvValue(name: string) {
  const value = readEnvValue(name)?.toLowerCase();

  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function getDatabasePath() {
  return readEnvValue('DATABASE_PATH') ?? DEFAULT_DATABASE_PATH;
}

export function getDatabaseProvider(): DatabaseProvider {
  const provider = readEnvValue('DATABASE_PROVIDER')?.toLowerCase();

  if (provider === 'postgres' || provider === 'sqlite') {
    return provider;
  }

  return getRuntimeDatabaseUrl() ? 'postgres' : 'sqlite';
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
  const upstreamDebugEnabled = readBooleanEnvValue('UPSTREAM_DEBUG');
  const alipayAppId = readEnvValue('ALIPAY_APP_ID');
  const alipayPrivateKey = readEnvValue('ALIPAY_PRIVATE_KEY');
  const alipayPublicKey = readEnvValue('ALIPAY_PUBLIC_KEY');
  const alipayNotifyUrl = readEnvValue('ALIPAY_NOTIFY_URL');

  return {
    nodeEnv: readEnvValue('NODE_ENV') ?? 'development',
    databaseProvider: getDatabaseProvider(),
    databasePath: getDatabasePath(),
    databaseUrlConfigured: Boolean(getRuntimeDatabaseUrl()),
    migrationDatabaseUrlConfigured: Boolean(getMigrationDatabaseUrl()),
    adminPassword: readEnvValue('ADMIN_PASSWORD'),
    upstreamBaseUrl,
    upstreamDebugEnabled,
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
    databaseProvider: env.databaseProvider,
    databasePath: env.databasePath,
    databaseUrlConfigured: env.databaseUrlConfigured,
    migrationDatabaseUrlConfigured: env.migrationDatabaseUrlConfigured,
    adminPasswordConfigured: Boolean(env.adminPassword),
    upstreamConfigured: env.upstreamConfigured,
    cardEncryptionKeyConfigured: Boolean(env.cardEncryptionKey),
    alipayConfigured: env.alipayConfigured,
  };
}
