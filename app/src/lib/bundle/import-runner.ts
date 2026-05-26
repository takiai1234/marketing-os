// Low-level Bundle.social API helpers for the daily import flow.
//
// All requests share the same `requestBundle` machinery in api-client.ts but
// these helpers add behaviour specific to the import-history endpoint:
//   - import is async (PENDING → COMPLETED), so we expose a poller
//   - aggregate refresh is synchronous and returns analytics immediately
//   - capacity check guards against hitting Bundle's 500-per-account ceiling
//
// Kept separate from api-client.ts so the small "connect" surface stays
// scannable; this file is where 90% of the Phase 5 cron logic lives.

import { BundleError } from './types';

const TIMEOUT_MS = 30_000;
// Bundle imports usually settle in 10-30s; we cap at 90s so a single hung
// account cannot stall the nightly cron for the rest of the team.
const POLL_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 3_000;

function getConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.bundle_api ?? process.env.BUNDLE_API_KEY;
  const baseUrl = process.env.BUNDLE_API_BASE_URL ?? 'https://api.bundle.social';
  if (!apiKey) {
    throw new Error('[bundle] bundle_api or BUNDLE_API_KEY env var is required');
  }
  return { apiKey, baseUrl };
}

interface ReqOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

async function call<T>(path: string, opts: ReqOptions = {}): Promise<T> {
  const { apiKey, baseUrl } = getConfig();
  const url = new URL(path, baseUrl);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new BundleError('TIMEOUT', `Bundle ${path} timed out`);
    }
    const msg = err instanceof Error ? err.message : 'Network error';
    throw new BundleError('NETWORK', `Bundle ${path} failed: ${msg}`);
  }
  clearTimeout(timer);

  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (res.ok) return parsed as T;

  const m =
    parsed && typeof parsed === 'object' && 'message' in parsed
      ? String((parsed as { message: unknown }).message)
      : `HTTP ${res.status}`;
  if (res.status === 401 || res.status === 403) {
    throw new BundleError('AUTH', m, res.status, parsed);
  }
  if (res.status >= 400 && res.status < 500) {
    throw new BundleError('INVALID_REQUEST', m, res.status, parsed);
  }
  throw new BundleError('UNKNOWN', m, res.status, parsed);
}

// ─── Capacity ────────────────────────────────────────────────────────────────

export interface CapacityInfo {
  used: number;
  limit: number;
  remaining: number;
}

/**
 * How many import slots remain for this Bundle social account.
 * NOTE (verified empirically): `limit` is lifetime per account — DELETE'ing
 * imported posts does NOT refund slots. Callers should warn when remaining
 * drops below ~50 and skip the import entirely at 0.
 */
export async function checkBundleCapacity(input: {
  teamId: string;
  bundleSocialAccountId: string;
}): Promise<CapacityInfo | null> {
  const res = await call<{
    limitPerSocialAccount: number;
    socialAccounts: Array<{ id: string; used: number; limit: number; remaining: number }>;
  }>('/api/v1/organization/usage/imports', { query: { teamId: input.teamId } });

  const match = res.socialAccounts.find((a) => a.id === input.bundleSocialAccountId);
  if (!match) return null;
  return { used: match.used, limit: match.limit, remaining: match.remaining };
}

// ─── Import (async) ──────────────────────────────────────────────────────────

export interface ImportTrigger {
  importId: string;
  status: ImportStatus['status'];
}

export interface ImportStatus {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  postsImported: number;
  analyticsImported: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export async function triggerImport(input: {
  teamId: string;
  socialAccountType: string;
  count: number;
  withAnalytics?: boolean;
}): Promise<ImportTrigger> {
  const r = await call<ImportStatus>('/api/v1/post-history-import/', {
    method: 'POST',
    body: {
      teamId: input.teamId,
      socialAccountType: input.socialAccountType,
      count: input.count,
      withAnalytics: input.withAnalytics ?? true,
    },
  });
  return { importId: r.id, status: r.status };
}

export async function getImportStatus(importId: string): Promise<ImportStatus> {
  return call<ImportStatus>(`/api/v1/post-history-import/${importId}`, { method: 'GET' });
}

/**
 * Poll the import job until it reaches a terminal state (COMPLETED / FAILED)
 * or the budget expires. Returns the final ImportStatus either way — caller
 * decides whether FAILED is fatal.
 */
export async function pollImportStatus(
  importId: string,
  budgetMs: number = POLL_TIMEOUT_MS
): Promise<ImportStatus> {
  const deadline = Date.now() + budgetMs;
  let last: ImportStatus | null = null;
  while (Date.now() < deadline) {
    last = await getImportStatus(importId);
    if (last.status === 'COMPLETED' || last.status === 'FAILED') return last;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  // Timed out — surface as FAILED so the orchestrator records it cleanly.
  return last ?? {
    id: importId, status: 'FAILED', postsImported: 0, analyticsImported: 0,
    error: 'poll_timeout', startedAt: null, completedAt: null,
  };
}

// ─── Aggregate refresh (synchronous) ─────────────────────────────────────────

export interface AccountAggregate {
  id: string;
  socialAccountId: string;
  impressions: number;
  impressionsUnique: number;
  views: number;
  viewsUnique: number;
  likes: number;
  comments: number;
  postCount: number;
  followers: number;
  following: number;
  forced: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Force a fresh aggregate snapshot for the given (team, platform) pair.
 * Updates Bundle's stored stats — followers, total impressions, etc.
 * Returns the new snapshot directly (no polling).
 */
export async function forceRefreshSocialAccount(input: {
  teamId: string;
  platformType: string;
}): Promise<AccountAggregate> {
  return call<AccountAggregate>('/api/v1/analytics/social-account/force', {
    method: 'POST',
    body: { teamId: input.teamId, platformType: input.platformType },
  });
}

// ─── Read imported posts ─────────────────────────────────────────────────────

export interface ImportedPostAnalytics {
  id: string;
  impressions: number;
  impressionsUnique: number;
  views: number;
  viewsUnique: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  saves: number;
  forced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImportedPost {
  id: string;
  externalId: string;
  title: string | null;
  description: string | null;
  thumbnail: string | null;
  smallThumbnail: string | null;
  permalink: string | null;
  publishedAt: string;
  type: string;          // POST | VIDEO | REEL | STORY | ...
  importedAt: string;
  analytics: ImportedPostAnalytics[];
}

export interface ImportedPostsPage {
  posts: ImportedPost[];
  total: number;
  limit: number;
  remainingCapacity: number;
}

export async function fetchImportedPosts(input: {
  teamId: string;
  socialAccountType: string;
  limit?: number;
  offset?: number;
}): Promise<ImportedPostsPage> {
  return call<ImportedPostsPage>('/api/v1/post-history-import/posts', {
    method: 'GET',
    query: {
      teamId: input.teamId,
      socialAccountType: input.socialAccountType,
      limit: input.limit ?? 16,
      offset: input.offset ?? 0,
    },
  });
}
