// Đăng bài lên Facebook Page qua Graph API POST endpoints.
// Tách khỏi api-client.ts (read-only) vì POST có semantics khác hẳn:
// KHÔNG retry — retry 1 request đăng bài có thể tạo bài trùng trên Page.
//
// SECURITY: không log token; message chỉ log độ dài.

import { FB_VERSION } from './api-client';
import type { FBApiError } from './types';
import { TokenExpiredError } from './types';
import { fb } from './api-client';

const GRAPH_BASE = 'https://graph.facebook.com';
const REQUEST_TIMEOUT_MS = 30_000;

/** Error codes báo token hết hạn/bị thu hồi — mirror api-client.ts */
const TOKEN_EXPIRED_CODES = new Set([190, 102]);

/** Extract FB error object từ response body (FB hay trả 200 kèm error body). */
function extractFbError(body: unknown): FBApiError | null {
  if (
    body !== null &&
    typeof body === 'object' &&
    'error' in body &&
    body.error !== null &&
    typeof body.error === 'object'
  ) {
    const e = body.error as Record<string, unknown>;
    if (typeof e['code'] === 'number') {
      return {
        code: e['code'] as number,
        message: String(e['message'] ?? ''),
        type: String(e['type'] ?? ''),
      };
    }
  }
  return null;
}

/**
 * POST tới Graph API với body form-urlencoded (message dài không nhét vào URL).
 * Không retry (tránh double-post), timeout 30s, throw TokenExpiredError trên 190/102.
 */
async function fbPost<T>(
  path: string,
  params: Record<string, string>,
  token: string
): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: token });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${GRAPH_BASE}/${FB_VERSION}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }

    const fbError = extractFbError(parsed);
    if (fbError) {
      if (TOKEN_EXPIRED_CODES.has(fbError.code)) {
        throw new TokenExpiredError(
          `FB token expired or revoked (code ${fbError.code}): ${fbError.message}`
        );
      }
      throw new Error(`FB API error (code ${fbError.code}) on ${path}: ${fbError.message}`);
    }
    if (!res.ok) {
      throw new Error(`FB HTTP ${res.status} on ${path}: ${JSON.stringify(parsed)}`);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`FB publish request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface PublishPagePostResult {
  /** Post ID FB trả về — dạng "{pageId}_{postId}" */
  postId: string;
  /** Permalink của bài — null nếu fetch permalink fail (best-effort) */
  permalinkUrl: string | null;
}

/**
 * Đăng 1 text post lên Facebook Page.
 * Cần page token có scope `pages_manage_posts`.
 *
 * @param token   Page access token (đã decrypt)
 * @param pageId  Facebook page ID (social_account.external_id)
 * @param message Nội dung bài viết
 * @param link    Optional — URL đính kèm (FB tự render link preview)
 */
export async function publishPagePost(
  token: string,
  pageId: string,
  message: string,
  link?: string
): Promise<PublishPagePostResult> {
  const params: Record<string, string> = { message };
  if (link) params.link = link;

  const created = await fbPost<{ id?: string }>(`/${pageId}/feed`, params, token);
  if (!created.id) {
    throw new Error('FB không trả về post id sau khi đăng');
  }

  // Permalink là best-effort — bài đã đăng thành công, thiếu permalink không phải lỗi
  let permalinkUrl: string | null = null;
  try {
    const detail = await fb<{ permalink_url?: string }>(
      `/${created.id}`,
      { fields: 'permalink_url' },
      token
    );
    permalinkUrl = detail.permalink_url ?? null;
  } catch (err) {
    console.warn(
      `[publishPagePost] Đăng OK (${created.id}) nhưng fetch permalink fail:`,
      err instanceof Error ? err.message : err
    );
  }

  return { postId: created.id, permalinkUrl };
}
