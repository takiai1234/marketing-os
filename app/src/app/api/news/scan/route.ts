// POST /api/news/scan — quét Facebook Ads Library theo link rồi lưu vào /news.
//
// Engine chính: meta-ads-collector (free, GraphQL nội bộ Meta, không token).
// Fallback: Apify actor (nếu CLI thiếu / URL dạng chưa hỗ trợ, và có token).
//
// Flow (đồng bộ, KHÔNG cần webhook):
//   1. Auth — chỉ user đăng nhập.
//   2. Validate body { url, limit? }: url phải là link facebook.com
//      (Ads Library hoặc page).
//   3. Parse URL → target:
//        - ads/library?view_all_page_id=N  → quét ads của page N
//        - ads/library?q=...               → keyword search
//        - page URL/slug                   → fb-cli resolve page id → quét
//        - ads/library?id=... (1 ad đơn)   → chưa hỗ trợ qua CLI → Apify
//   4. Map ad → MappedNewsArticle (source_type='facebook_ads').
//   5. Bulk upsert (dedupe theo link) → revalidate cache 'news'.
//   6. Trả về { fetched, mapped, inserted, engine } để UI toast.

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import {
  runActorSync,
  buildFacebookAdsInput,
  DEFAULT_FACEBOOK_ADS_ACTOR,
  ApifySyncError,
} from '@/lib/news/apify-sync';
import { mapApifyItem, type MappedNewsArticle } from '@/lib/news/apify-mapper';
import { collectMetaAds, mapMetaAdItem, MetaAdsCliError } from '@/lib/news/meta-ads-cli';
import { normalizePageRef, fetchFbPageId } from '@/lib/news/fb-cli';
import { upsertApifyArticles } from '@/lib/news/news-db';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';

export const runtime = 'nodejs';
// Quét có thể chạy lâu — nới maxDuration để không bị cắt giữa chừng.
export const maxDuration = 300;

/** Giới hạn số ad mỗi lần quét — chặn input vô lý. */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

interface ScanBody {
  url?: unknown;
  limit?: unknown;
}

/** Chỉ chấp nhận URL facebook.com (Ads Library hoặc page). */
function validateFacebookUrl(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  const ok =
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'fb.com' ||
    host.endsWith('.fb.com');
  return ok ? parsed : null;
}

type ScanTarget =
  | { kind: 'pageId'; pageId: string; country: string | null }
  | { kind: 'query'; query: string; country: string | null }
  | { kind: 'pageRef'; ref: string }
  | { kind: 'unsupported'; reason: string };

/** Phân loại URL → cách quét. Country lấy từ URL nếu có (ads/library có
 *  param country=VN), không thì meta-ads-cli tự dùng default. */
function resolveTarget(url: URL): ScanTarget {
  const countryRaw = url.searchParams.get('country');
  const country =
    countryRaw && /^[A-Za-z]{2}$/.test(countryRaw) ? countryRaw.toUpperCase() : null;

  if (url.pathname.includes('/ads/library')) {
    const pageId = url.searchParams.get('view_all_page_id');
    if (pageId && /^\d+$/.test(pageId)) return { kind: 'pageId', pageId, country };
    const q = url.searchParams.get('q');
    if (q && q.trim()) return { kind: 'query', query: q.trim(), country };
    return {
      kind: 'unsupported',
      reason:
        'Link Ads Library dạng này (vd ?id=1 ad đơn lẻ) chưa hỗ trợ — dùng link có view_all_page_id, q=keyword, hoặc link page.',
    };
  }
  // Page URL thường (https://www.facebook.com/<slug>)
  return { kind: 'pageRef', ref: normalizePageRef(url.toString()) };
}

/** Quét bằng meta-ads-collector. Throws MetaAdsCliError/FbCliError khi fail. */
async function scanViaMetaAdsCli(
  target: ScanTarget,
  limit: number
): Promise<{ fetched: number; mapped: MappedNewsArticle[] }> {
  if (target.kind === 'unsupported') {
    throw new MetaAdsCliError(target.reason);
  }

  let pageId: string | null = null;
  let query: string | null = null;
  let country: string | null = null;

  if (target.kind === 'pageId') {
    pageId = target.pageId;
    country = target.country;
  } else if (target.kind === 'query') {
    query = target.query;
    country = target.country;
  } else {
    // pageRef → resolve numeric id qua fb-cli
    pageId = await fetchFbPageId(target.ref);
    if (!pageId) {
      throw new MetaAdsCliError(`Không resolve được page id từ "${target.ref}"`);
    }
  }

  const ads = await collectMetaAds(
    { pageId: pageId ?? undefined, query: query ?? undefined, country: country ?? undefined },
    limit
  );
  const mapped = ads
    .map((ad) => mapMetaAdItem(ad))
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return { fetched: ads.length, mapped };
}

/** Fallback: Apify actor (cần token). */
async function scanViaApify(
  url: string,
  limit: number
): Promise<{ fetched: number; mapped: MappedNewsArticle[] }> {
  const token = await getSettingOrEnv('APIFY_API_TOKEN');
  if (!token) {
    throw new ApifySyncError(
      'meta-ads-collector không chạy được và APIFY_API_TOKEN chưa set để fallback.'
    );
  }
  const actorId =
    (await getSettingOrEnv('APIFY_FACEBOOK_ADS_ACTOR')) ?? DEFAULT_FACEBOOK_ADS_ACTOR;
  const input = buildFacebookAdsInput([url], limit);
  const items = await runActorSync(actorId, input, token);
  const mapped = items
    .map((item) => mapApifyItem('facebook_ads', item))
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return { fetched: items.length, mapped };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ─── Parse + validate body ────────────────────────────────────────────
  let body: ScanBody;
  try {
    body = (await req.json()) as ScanBody;
  } catch {
    return NextResponse.json({ error: 'Body không phải JSON hợp lệ' }, { status: 400 });
  }

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) {
    return NextResponse.json({ error: 'Thiếu "url" để quét' }, { status: 400 });
  }
  const url = validateFacebookUrl(rawUrl);
  if (!url) {
    return NextResponse.json(
      { error: 'URL phải là link facebook.com (Ads Library hoặc page)' },
      { status: 400 }
    );
  }

  let limit = DEFAULT_LIMIT;
  if (typeof body.limit === 'number' && Number.isFinite(body.limit)) {
    limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(body.limit)));
  }

  // ─── Quét: meta-ads-cli trước, Apify fallback ─────────────────────────
  const target = resolveTarget(url);
  const logId = await startSyncLog('news_ingestion');
  let engine = 'meta-ads-cli';
  try {
    let result: { fetched: number; mapped: MappedNewsArticle[] };
    try {
      result = await scanViaMetaAdsCli(target, limit);
    } catch (err) {
      console.warn(
        `[POST /api/news/scan] meta-ads-cli fail (${err instanceof Error ? err.message : err}) — thử Apify fallback`
      );
      engine = 'apify';
      result = await scanViaApify(url.toString(), limit);
    }

    const inserted = await upsertApifyArticles(result.mapped);

    await finishSyncLog(
      logId,
      'success',
      inserted,
      `ads engine=${engine} fetched=${result.fetched} mapped=${result.mapped.length} inserted=${inserted}`
    );
    revalidateTag('news', 'max');

    return NextResponse.json({
      ok: true,
      url: url.toString(),
      engine,
      fetched: result.fetched,
      mapped: result.mapped.length,
      inserted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/news/scan] url=${url.toString()}: ${msg}`);
    await finishSyncLog(logId, 'failed', 0, msg.slice(0, 1000));
    return NextResponse.json({ error: 'Quét thất bại', detail: msg }, { status: 500 });
  }
}
