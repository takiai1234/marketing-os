// Apify "sync" client — chạy actor và đợi kết quả trong 1 HTTP call.
//
// Khác apify-client.ts (fetch dataset đã có sẵn), file này dùng endpoint
// `/v2/acts/<actor>/run-sync-get-dataset-items` để:
//   1. Dispatch actor run
//   2. Wait until run finishes (Apify hold connection)
//   3. Return dataset items trực tiếp
//
// Lợi ích: KHÔNG cần webhook — app cron gọi sync endpoint, đợi response,
// upsert. User KHÔNG cần touch Apify Console.
//
// Lưu ý timeout: Apify default 5 phút. Twitter scrape 10-50 tweet/handle
// thường <60s. FB scrape chậm hơn, có thể 2-3 phút cho 9 pages.
// Set fetch timeout 10 phút để chắc ăn.

import { getSettingOrEnv } from '@/lib/settings/api-keys';

const APIFY_API_BASE = 'https://api.apify.com/v2';
const SYNC_TIMEOUT_MS = 10 * 60 * 1000; // 10 phút

export class ApifySyncError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'ApifySyncError';
  }
}

/**
 * Run actor synchronously và trả về dataset items.
 *
 * @param actorId — format "username/actor-name" (vd "apidojo/twitter-scraper-lite")
 *                  HOẶC actor ID hex 17 ký tự.
 * @param input   — JSON input cho actor (shape khác nhau per actor)
 * @param token   — Apify API token (nếu không pass → đọc từ DB setting)
 *
 * Throws ApifySyncError nếu token thiếu, actor fail, hoặc timeout.
 * Caller catch để log + skip — không quit cron.
 */
export async function runActorSync(
  actorId: string,
  input: Record<string, unknown>,
  token?: string
): Promise<Record<string, unknown>[]> {
  const apiToken = token ?? (await getSettingOrEnv('APIFY_API_TOKEN'));
  if (!apiToken) {
    throw new ApifySyncError(
      'APIFY_API_TOKEN chưa set. Vào /settings/integrations để config.'
    );
  }

  // Actor ID có thể là "username/name" hoặc hex — URL encode để safe
  const encodedActor = encodeURIComponent(actorId);
  const url = `${APIFY_API_BASE}/acts/${encodedActor}/run-sync-get-dataset-items?token=${encodeURIComponent(apiToken)}&clean=true`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ApifySyncError(
        `Apify actor ${actorId} fail (HTTP ${res.status}): ${body.slice(0, 300)}`,
        res.status
      );
    }

    const items = (await res.json()) as unknown;
    if (!Array.isArray(items)) {
      throw new ApifySyncError(`Actor ${actorId} response không phải array`);
    }
    return items as Record<string, unknown>[];
  } catch (err) {
    if (err instanceof ApifySyncError) throw err;
    if ((err as { name?: string }).name === 'AbortError') {
      throw new ApifySyncError(`Actor ${actorId} timeout sau ${SYNC_TIMEOUT_MS / 1000}s`);
    }
    throw new ApifySyncError(
      `Actor ${actorId} call fail: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Preset inputs ──────────────────────────────────────────────────────
//
// Mỗi actor có shape input riêng. Hàm helper build input từ list username/URL.
// Nếu admin muốn dùng actor khác → có thể override actor ID trong settings,
// nhưng input shape phải tự match. Để v1 hardcode 2 actor phổ biến.

/** Default Twitter actor — apidojo/twitter-scraper-lite (~$0.30/1k tweets). */
export const DEFAULT_TWITTER_ACTOR = 'apidojo/twitter-scraper-lite';

/** Default Facebook posts actor — apify/facebook-posts-scraper. */
export const DEFAULT_FACEBOOK_ACTOR = 'apify/facebook-posts-scraper';

/** Build input cho Twitter scraper từ list handle.
 *
 *  Mỗi actor có field name khác nhau cho input. Để work với nhiều actor
 *  cùng lúc, push cả mọi candidate field — actor sẽ chỉ đọc field nó cần,
 *  ignore unknown fields (Apify behavior chung).
 *
 *  Actor coverage:
 *    - apidojo/twitter-scraper-lite      → `twitterHandles`
 *    - kaitoeasyapi/...                  → `searchTerms` hoặc `usernames`
 *    - quacker/twitter-scraper           → `handles` hoặc `startUrls`
 *    - microworlds/twitter-scraper       → `searchTerms: ["from:user"]`
 *    - tweetscout/...                    → `usernames`
 */
export function buildTwitterInput(
  handles: string[],
  maxItemsPerHandle = 20
): Record<string, unknown> {
  const maxTotal = handles.length * maxItemsPerHandle;
  return {
    // apidojo, kaitoeasyapi, microworlds, tweetscout — đa số dùng 1 trong
    // 5 field này:
    twitterHandles: handles,
    handles: handles,
    usernames: handles,
    searchTerms: handles.map((h) => `from:${h}`),
    startUrls: handles.map((h) => ({
      url: `https://twitter.com/${h}`,
    })),
    // Limits — cũng đa danh field
    maxItems: maxTotal,
    maxTweets: maxTotal,
    maxTweetsPerProfile: maxItemsPerHandle,
    tweetsDesired: maxTotal,
    sort: 'Latest',
  };
}

/** Build input cho Facebook scraper từ list page URL hoặc slug. */
export function buildFacebookInput(
  pages: string[],
  resultsLimitPerPage = 20
): Record<string, unknown> {
  // Normalize: nếu user paste 'huanyoutube' → expand thành full URL
  const startUrls = pages.map((p) => {
    const trimmed = p.trim();
    if (trimmed.startsWith('http')) return { url: trimmed };
    return { url: `https://www.facebook.com/${trimmed}` };
  });
  return {
    startUrls,
    resultsLimit: pages.length * resultsLimitPerPage,
  };
}

/** Parse danh sách CSV/newline-separated → array trimmed, no empty. */
export function parseList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
