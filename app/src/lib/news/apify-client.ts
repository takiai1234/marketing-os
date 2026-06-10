// Apify API client — fetch dataset items.
//
// Khi Apify actor chạy xong (qua user-setup Schedule), Apify gọi webhook
// /api/news/apify-webhook với resource.defaultDatasetId. Endpoint dùng helper
// này fetch items, sau đó map + upsert vào news_article.
//
// Token đọc từ app_setting (key APIFY_API_TOKEN, encrypted) → fallback env.
//
// API doc: https://docs.apify.com/api/v2#tag/Datasets

import { getSettingOrEnv } from '@/lib/settings/api-keys';

const APIFY_API_BASE = 'https://api.apify.com/v2';
const FETCH_TIMEOUT_MS = 30_000;
/** Apify dataset có thể chứa nhiều items (cả 19 source × N tweets/post mỗi run).
 *  Limit để defensive — actor batch lớn vẫn hợp lý <500. */
const MAX_ITEMS_PER_FETCH = 1000;

export class ApifyError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'ApifyError';
  }
}

/**
 * Fetch all items from 1 Apify dataset.
 *
 * @param datasetId — vd "abc123def456" từ webhook payload (resource.defaultDatasetId)
 * @param limit — max items per response (default MAX_ITEMS_PER_FETCH)
 *
 * Throws ApifyError nếu token chưa set hoặc API call fail. Caller catch
 * để log + return early — webhook endpoint không nên throw để Apify retry vô tận.
 */
export async function fetchDatasetItems(
  datasetId: string,
  limit: number = MAX_ITEMS_PER_FETCH
): Promise<Record<string, unknown>[]> {
  const token = await getSettingOrEnv('APIFY_API_TOKEN');
  if (!token) {
    throw new ApifyError(
      'APIFY_API_TOKEN chưa set. Vào /settings/integrations để config.'
    );
  }

  const url = new URL(`${APIFY_API_BASE}/datasets/${datasetId}/items`);
  url.searchParams.set('token', token);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('clean', 'true'); // skip hidden/empty items

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ApifyError(
        `Apify dataset fetch fail (status ${res.status}): ${body.slice(0, 200)}`,
        res.status
      );
    }

    const items = (await res.json()) as unknown;
    if (!Array.isArray(items)) {
      throw new ApifyError('Apify response không phải array');
    }
    return items as Record<string, unknown>[];
  } catch (err) {
    if (err instanceof ApifyError) throw err;
    throw new ApifyError(
      `Apify fetch fail: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timeout);
  }
}
