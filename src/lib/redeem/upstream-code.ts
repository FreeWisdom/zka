import { createHash } from 'node:crypto';

export function normalizeUpstreamCode(value: string) {
  return value.trim().toUpperCase();
}

export function encodeUpstreamCode(value: string) {
  return Buffer.from(normalizeUpstreamCode(value), 'utf8').toString('base64');
}

export function decodeUpstreamCode(encodedValue: string) {
  return Buffer.from(encodedValue, 'base64').toString('utf8');
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
