import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

import { getServerEnv } from '@/lib/config/env';

export const ADMIN_SESSION_COOKIE_NAME = 'zka_admin_session';

const ADMIN_SESSION_VERSION = 'v1';
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function hashText(value: string) {
  return createHash('sha256').update(value).digest();
}

function getAdminSessionSecret(adminPassword: string) {
  return hashText(`zka-admin-session:${adminPassword}`);
}

function parseCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) {
    return new Map<string, string>();
  }

  return new Map(
    cookieHeader
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf('=');

        if (separatorIndex < 0) {
          return [entry, ''] as const;
        }

        return [
          entry.slice(0, separatorIndex),
          decodeURIComponent(entry.slice(separatorIndex + 1)),
        ] as const;
      }),
  );
}

function createSessionSignature(issuedAt: string, adminPassword: string) {
  return createHmac('sha256', getAdminSessionSecret(adminPassword))
    .update(`${ADMIN_SESSION_VERSION}:${issuedAt}`)
    .digest('hex');
}

function getConfiguredAdminPassword() {
  return getServerEnv().adminPassword;
}

export function getAdminLoginRedirectPath(input?: string | null) {
  if (!input) {
    return '/admin/inventory';
  }

  if (!input.startsWith('/') || input.startsWith('//') || input.startsWith('/api/')) {
    return '/admin/inventory';
  }

  return input;
}

export function verifyAdminPassword(input: string) {
  const configuredPassword = getConfiguredAdminPassword();

  if (!configuredPassword) {
    return false;
  }

  return timingSafeEqual(hashText(configuredPassword), hashText(input));
}

export function createAdminSessionValue(adminPassword: string, issuedAt = Date.now()) {
  const issuedAtValue = String(issuedAt);
  const signature = createSessionSignature(issuedAtValue, adminPassword);

  return `${ADMIN_SESSION_VERSION}.${issuedAtValue}.${signature}`;
}

export function isAdminSessionValueValid(sessionValue?: string | null) {
  const configuredPassword = getConfiguredAdminPassword();

  if (!configuredPassword || !sessionValue) {
    return false;
  }

  const [version, issuedAtText, signature] = sessionValue.split('.');

  if (version !== ADMIN_SESSION_VERSION || !issuedAtText || !signature) {
    return false;
  }

  const issuedAt = Number(issuedAtText);

  if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
    return false;
  }

  if (Date.now() > issuedAt + ADMIN_SESSION_MAX_AGE_SECONDS * 1000) {
    return false;
  }

  const expectedSignature = createSessionSignature(issuedAtText, configuredPassword);
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function isAdminRequestAuthenticated(request: Request) {
  const cookieStore = parseCookieHeader(request.headers.get('cookie'));

  return isAdminSessionValueValid(cookieStore.get(ADMIN_SESSION_COOKIE_NAME));
}

export async function isAdminViewerAuthenticated() {
  const cookieStore = await cookies();

  return isAdminSessionValueValid(cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

export async function redirectIfAdminUnauthenticated(nextPath: string) {
  if (await isAdminViewerAuthenticated()) {
    return;
  }

  redirect(`/admin/login?next=${encodeURIComponent(getAdminLoginRedirectPath(nextPath))}`);
}

export function createAdminUnauthorizedResponse() {
  return NextResponse.json(
    {
      success: false,
      message: '请先登录后台',
    },
    { status: 401 },
  );
}

export function appendAdminSessionCookie(response: NextResponse, sessionValue: string) {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: sessionValue,
    httpOnly: true,
    sameSite: 'lax',
    secure: getServerEnv().nodeEnv === 'production',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: getServerEnv().nodeEnv === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}
