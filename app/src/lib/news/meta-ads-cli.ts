// meta-ads-cli — quét Facebook Ads Library qua CLI `meta-ads-collector`
// (promisingcoder/MetaAdsCollector, PyPI).
//
// Thay Apify actor apify/facebook-ads-scraper: tool này gọi thẳng GraphQL
// nội bộ của Meta Ad Library — KHÔNG cần API key, không cần browser, lấy
// được mọi loại ad (commercial + political) ở mọi quốc gia, kèm creative
// đầy đủ (body, ảnh, CTA) + page info.
//
// Binary: env META_ADS_CLI_PATH (default `meta-ads-collector` trên PATH —
// Docker image cài qua pip). Country bắt buộc 2 chữ ISO (không có "ALL")
// → default env META_ADS_COUNTRY hoặc 'VN'.
//
// CLI ghi kết quả ra file JSON ({metadata, ads}) → wrapper dùng temp file
// rồi đọc + xoá.

import { execFile } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { MappedNewsArticle } from '@/lib/news/apify-mapper';

const CLI = process.env.META_ADS_CLI_PATH || 'meta-ads-collector';
const DEFAULT_COUNTRY = (process.env.META_ADS_COUNTRY || 'VN').toUpperCase();
const EXEC_TIMEOUT_MS = 240_000;
const MAX_BUFFER = 16 * 1024 * 1024;

export class MetaAdsCliError extends Error {
  constructor(message: string, public readonly binaryMissing = false) {
    super(message);
    this.name = 'MetaAdsCliError';
  }
}

export interface MetaAdsTarget {
  /** Numeric page id (ưu tiên nếu có — chính xác nhất). */
  pageId?: string;
  /** Keyword search trong Ads Library. */
  query?: string;
  /** ISO 3166-1 alpha-2 (vd 'VN', 'US'). Default META_ADS_COUNTRY/VN. */
  country?: string;
}

/** Chạy meta-ads-collector và trả về mảng ads (raw object từ tool). */
export async function collectMetaAds(
  target: MetaAdsTarget,
  limit = 50
): Promise<Record<string, unknown>[]> {
  if (!target.pageId && !target.query) {
    throw new MetaAdsCliError('Cần pageId hoặc query để quét Ads Library');
  }

  const country = (target.country || DEFAULT_COUNTRY).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new MetaAdsCliError(`Country không hợp lệ: ${country} (cần mã 2 chữ, vd VN)`);
  }

  const outFile = path.join(
    os.tmpdir(),
    `meta-ads-${Date.now()}-${randomBytes(4).toString('hex')}.json`
  );

  const args = target.pageId
    ? ['--page-ids', target.pageId]
    : ['-q', target.query as string];
  args.push(
    '-c', country,
    '-n', String(limit),
    '-o', outFile,
    // --no-enrich: bỏ bước fetch chi tiết từng ad (chậm) — creative cơ bản đủ cho /news
    '--no-enrich',
    '-s', 'all' // quét cả ad active lẫn inactive — bức tranh đầy đủ hơn
  );

  await new Promise<void>((resolve, reject) => {
    execFile(
      CLI,
      args,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (err, _stdout, stderr) => {
        if (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            reject(
              new MetaAdsCliError(
                `Binary \`${CLI}\` không tìm thấy. Cài: pip install meta-ads-collector (hoặc set META_ADS_CLI_PATH).`,
                true
              )
            );
            return;
          }
          const detail = (stderr || err.message).trim().slice(-400);
          reject(new MetaAdsCliError(`meta-ads-collector fail: ${detail}`));
          return;
        }
        resolve();
      }
    );
  });

  try {
    const raw = await readFile(outFile, 'utf8');
    const parsed = JSON.parse(raw) as { ads?: unknown };
    return Array.isArray(parsed.ads) ? (parsed.ads as Record<string, unknown>[]) : [];
  } catch (err) {
    throw new MetaAdsCliError(
      `Đọc output fail: ${err instanceof Error ? err.message : err}`
    );
  } finally {
    unlink(outFile).catch(() => {});
  }
}

// ─── Mapper: meta-ads-collector ad → MappedNewsArticle ──────────────────
//
// Shape (v1.4.0): { id, page: {id, name, profile_picture_url, page_url},
//   is_active, delivery_start_time, creatives: [{body, title, caption,
//   link_url, image_url, cta_text, cta_type}], publisher_platforms, ... }

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

/** Map 1 ad → news_article row (source_type='facebook_ads').
 *  Link build từ ad archive id — CÙNG format với mapper Apify cũ
 *  (https://www.facebook.com/ads/library/?id=...) nên dedupe xuyên engine. */
export function mapMetaAdItem(ad: Record<string, unknown>): MappedNewsArticle | null {
  const id = str(ad.id) ?? str(ad.ad_library_id);
  if (!id) return null;
  const url = `https://www.facebook.com/ads/library/?id=${id}`;

  const page = (ad.page ?? {}) as Record<string, unknown>;
  const pageName = str(page.name);
  const avatar = str(page.profile_picture_url);

  const creatives = Array.isArray(ad.creatives) ? ad.creatives : [];
  const creative = (creatives[0] ?? {}) as Record<string, unknown>;
  const text = str(creative.body) ?? str(creative.title) ?? str(creative.caption);
  const coverImage = str(creative.image_url);

  let publishedAt: Date | null = null;
  const start = str(ad.delivery_start_time);
  if (start) {
    const d = new Date(start);
    if (!isNaN(d.getTime())) publishedAt = d;
  }

  const cleaned = (text ?? '').replace(/\s+/g, ' ').trim();
  const title = cleaned
    ? truncate(cleaned, 120)
    : pageName
      ? `Quảng cáo — ${pageName}`
      : 'Quảng cáo Facebook';

  return {
    source: pageName ? `facebook_ads:${pageName}` : 'facebook_ads:unknown',
    sourceType: 'facebook_ads',
    title,
    link: url,
    description: cleaned ? truncate(cleaned, 500) : null,
    coverImage,
    publishedAt,
    authorHandle: pageName,
    authorName: pageName,
    authorAvatar: avatar,
    likesCount: null, // Ads Library không có engagement
    sharesCount: null,
    rawPayload: ad,
  };
}
