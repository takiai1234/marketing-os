// Google OAuth2 helpers — authorization URL builder + token exchange + refresh.
// Credentials lấy từ app_setting (DB-first) → env fallback.
// Scope: analytics.readonly

import { getSettingOrEnv, getSetting, setSetting } from '@/lib/settings/api-keys';

export const GOOGLE_CLIENT_ID_KEY = 'GOOGLE_CLIENT_ID';
export const GOOGLE_CLIENT_SECRET_KEY = 'GOOGLE_CLIENT_SECRET';
export const GOOGLE_REFRESH_TOKEN_KEY = 'GOOGLE_REFRESH_TOKEN';

const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function getRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? 'https://mkt.taki.vn';
  return `${base}/api/integrations/google/callback`;
}

export async function getGoogleClientId(): Promise<string> {
  const val = await getSettingOrEnv(GOOGLE_CLIENT_ID_KEY);
  if (!val) throw new Error('GOOGLE_CLIENT_ID chưa cấu hình.');
  return val;
}

export async function getGoogleClientSecret(): Promise<string> {
  const val = await getSettingOrEnv(GOOGLE_CLIENT_SECRET_KEY);
  if (!val) throw new Error('GOOGLE_CLIENT_SECRET chưa cấu hình.');
  return val;
}

export async function isGoogleConfigured(): Promise<boolean> {
  try {
    await getGoogleClientId();
    await getGoogleClientSecret();
    return true;
  } catch {
    return false;
  }
}

export async function isGoogleConnected(): Promise<boolean> {
  const token = await getSetting(GOOGLE_REFRESH_TOKEN_KEY);
  return Boolean(token);
}

export async function buildAuthUrl(): Promise<string> {
  const clientId = await getGoogleClientId();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const [clientId, clientSecret] = await Promise.all([
    getGoogleClientId(),
    getGoogleClientSecret(),
  ]);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.error ?? 'Google token exchange thất bại');
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function getAccessToken(): Promise<string> {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getGoogleClientId(),
    getGoogleClientSecret(),
    getSetting(GOOGLE_REFRESH_TOKEN_KEY),
  ]);
  if (!refreshToken) throw new Error('Google chưa kết nối. Vào /settings/integrations để kết nối.');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error ?? 'Refresh Google access token thất bại');
  }
  return data.access_token;
}

export async function saveRefreshToken(
  refreshToken: string,
  updatedBy: string
): Promise<void> {
  await setSetting(
    GOOGLE_REFRESH_TOKEN_KEY,
    refreshToken,
    updatedBy,
    'Google OAuth2 refresh token — Analytics readonly'
  );
}
