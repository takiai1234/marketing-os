import {
  BundleError,
  type BundleSocialAccount,
  type BundleTeam,
} from './types';

const TIMEOUT_MS = 15_000;

// Subset of Bundle's enum we actively call against. Strings come from
// PLATFORMS registry's bundleType, so any string is structurally valid —
// we keep the type wide to avoid duplicating that enum here.
type BundlePlatform = string;

function getConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.bundle_api ?? process.env.BUNDLE_API_KEY;
  const baseUrl = process.env.BUNDLE_API_BASE_URL ?? 'https://api.bundle.social';

  if (!apiKey) {
    throw new Error('[bundle] bundle_api or BUNDLE_API_KEY env var is required');
  }

  return { apiKey, baseUrl };
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body;
  if (
    body &&
    typeof body === 'object' &&
    'message' in body &&
    typeof (body as { message?: unknown }).message === 'string'
  ) {
    return (body as { message: string }).message;
  }
  return fallback;
}

function mapErrorResponse(res: Response, rawBody: unknown): BundleError {
  const message = extractMessage(rawBody, `Bundle request failed with HTTP ${res.status}`);
  if (res.status === 401 || res.status === 403) {
    return new BundleError('AUTH', message, res.status, rawBody);
  }
  if (res.status >= 400 && res.status < 500) {
    return new BundleError('INVALID_REQUEST', message, res.status, rawBody);
  }
  return new BundleError('UNKNOWN', message, res.status, rawBody);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

// Single generic helper supporting GET (query) + POST/DELETE (body).
// Returns parsed JSON or throws BundleError on non-2xx.
async function bundleRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { apiKey, baseUrl } = getConfig();
  const url = new URL(path, baseUrl);

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
    res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new BundleError('TIMEOUT', 'Bundle request timed out');
    }
    const message = err instanceof Error ? err.message : 'Network error';
    throw new BundleError('NETWORK', `Bundle request failed: ${message}`);
  }

  clearTimeout(timeoutId);
  const rawBody = await parseBody(res);

  if (res.ok) return rawBody as T;
  throw mapErrorResponse(res, rawBody);
}

// ─── Existing helpers (preserved for FB flow) ───────────────────────────────

export function createBundleTeam(input: {
  name: string;
  avatarUrl?: string | null;
  copyTeamId?: string | null;
}): Promise<BundleTeam> {
  return bundleRequest<BundleTeam>('/api/v1/team/', { body: input });
}

export function refreshBundleChannels(input: {
  teamId: string;
  type: BundlePlatform;
}): Promise<BundleSocialAccount> {
  return bundleRequest<BundleSocialAccount>(
    '/api/v1/social-account/refresh-channels',
    { body: input }
  );
}

export function setBundleChannel(input: {
  teamId: string;
  type: BundlePlatform;
  channelId: string;
}): Promise<BundleSocialAccount> {
  return bundleRequest<BundleSocialAccount>(
    '/api/v1/social-account/set-channel',
    { body: input }
  );
}

// ─── New helpers for multi-platform Bundle OAuth flow ───────────────────────

export interface ConnectSocialAccountInput {
  type: BundlePlatform;
  teamId: string;
  /** Bundle will redirect the user here after OAuth completes (success or error). */
  redirectUrl: string;
}

export interface ConnectSocialAccountResult {
  url: string;
}

/**
 * Request an OAuth URL from Bundle. User opens this URL to connect their
 * social account; Bundle handles all OAuth quirks per platform and redirects
 * back to `redirectUrl` when done.
 */
export function connectBundleSocialAccount(
  input: ConnectSocialAccountInput
): Promise<ConnectSocialAccountResult> {
  return bundleRequest<ConnectSocialAccountResult>(
    '/api/v1/social-account/connect',
    { body: input }
  );
}

/**
 * Fetch the social account Bundle stores for a given (team, platform) pair.
 * Used in the finalize callback after the user completes Bundle's OAuth —
 * Bundle returns the externalId + display info we need to upsert locally.
 *
 * Returns null when the account hasn't been wired up yet (e.g. user closed
 * Bundle tab before completing OAuth). Caller should retry with backoff.
 */
export async function getBundleSocialAccountByType(input: {
  type: BundlePlatform;
  teamId: string;
}): Promise<BundleSocialAccount | null> {
  try {
    return await bundleRequest<BundleSocialAccount>('/api/v1/social-account/by-type', {
      method: 'GET',
      query: { type: input.type, teamId: input.teamId },
    });
  } catch (err) {
    if (err instanceof BundleError && (err.httpStatus === 404 || err.httpStatus === 400)) return null;
    throw err;
  }
}

/**
 * Disconnect a social account from Bundle (also removes scheduled posts on
 * Bundle's side). Use when user clicks "Disconnect" on a non-FB channel.
 */
export function disconnectBundleSocialAccount(input: {
  type: BundlePlatform;
  teamId: string;
}): Promise<BundleSocialAccount> {
  return bundleRequest<BundleSocialAccount>(
    '/api/v1/social-account/disconnect',
    { method: 'DELETE', body: input }
  );
}
