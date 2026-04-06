const DEFAULT_DATABASE_PATH = './data/platform-b.db';

function readEnvValue(name: string) {
  const value = process.env[name]?.trim();

  return value ? value : undefined;
}

export function getDatabasePath() {
  return readEnvValue('DATABASE_PATH') ?? DEFAULT_DATABASE_PATH;
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
    adminPassword: readEnvValue('ADMIN_PASSWORD'),
    upstreamBaseUrl,
    upstreamApiKey,
    cardEncryptionKey: readEnvValue('CARD_ENCRYPTION_KEY'),
    alipayAppId,
    alipayPrivateKey,
    alipayPublicKey,
    alipayNotifyUrl,
    upstreamConfigured: Boolean(upstreamBaseUrl && upstreamApiKey),
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
    adminPasswordConfigured: Boolean(env.adminPassword),
    upstreamConfigured: env.upstreamConfigured,
    cardEncryptionKeyConfigured: Boolean(env.cardEncryptionKey),
    alipayConfigured: env.alipayConfigured,
  };
}
