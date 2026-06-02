// Anthropic Claude SDK wrapper — async để load key từ DB (admin set qua UI)
// HOẶC fallback env var.
//
// Server-only — KHÔNG import vào client component (sẽ pull key vào browser).
//
// Caller pattern thay đổi (vs version cũ sync):
//   OLD:  const a = getAnthropic();              // throw nếu env thiếu
//   NEW:  const a = await getAnthropic();        // throw nếu cả DB lẫn env thiếu
//
//   OLD:  if (isAnthropicConfigured()) ...       // sync env check
//   NEW:  if (await isAnthropicConfigured())     // async (DB + env)

import Anthropic from '@anthropic-ai/sdk';
import { getSettingOrEnv } from '@/lib/settings/api-keys';

// Key trong app_setting table — admin paste qua UI sẽ ghi vào đây
export const ANTHROPIC_KEY_NAME = 'ANTHROPIC_API_KEY';

// 2 model offered cho user chọn. Slug literal khớp với Anthropic API docs.
// Update khi có model mới (vd Opus 5).
export const AVAILABLE_MODELS = [
  {
    id: 'claude-sonnet-4-5',
    label: 'Sonnet 4.5',
    description: 'Nhanh, rẻ — ~$3/1M input, $15/1M output. Đủ cho 90% skill.',
  },
  {
    id: 'claude-opus-4-5',
    label: 'Opus 4.5',
    description: 'Tốt nhất cho creative writing — ~$15/1M input, $75/1M output.',
  },
] as const;

export type AnthropicModelId = (typeof AVAILABLE_MODELS)[number]['id'];

const VALID_MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map((m) => m.id));

export function isValidModelId(s: string): s is AnthropicModelId {
  return VALID_MODEL_IDS.has(s);
}

// In-memory cache cho key — tránh DB query mỗi request. TTL ngắn để
// invalidate khi admin update key (next call sau TTL sẽ re-fetch).
let cachedKey: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 1 phút

/** Clear cache — gọi sau khi admin save key mới qua API. */
export function invalidateAnthropicKeyCache(): void {
  cachedKey = null;
  cachedAt = 0;
}

/**
 * Load API key từ DB (ưu tiên) hoặc env (fallback). Cache 1 phút để
 * giảm DB query. Trả null nếu cả 2 đều thiếu.
 */
async function loadKey(): Promise<string | null> {
  if (cachedKey && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedKey;
  }
  const key = await getSettingOrEnv(ANTHROPIC_KEY_NAME);
  cachedKey = key;
  cachedAt = Date.now();
  return key;
}

/**
 * Returns Anthropic client. Throws nếu key chưa có ở cả DB lẫn env.
 * Caller phải check `await isAnthropicConfigured()` trước để graceful degrade UI.
 */
export async function getAnthropic(): Promise<Anthropic> {
  const key = await loadKey();
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY chưa được cấu hình. Admin vào /settings/integrations để set.'
    );
  }
  // Tạo client mới mỗi lần khi key thay đổi (apiKey trong constructor là final
  // — không update được). In-memory cache key handle reuse case bình thường.
  return new Anthropic({ apiKey: key });
}

/** Feature flag — UI dùng để show/hide nút "Chat". KHÔNG throw nếu thiếu. */
export async function isAnthropicConfigured(): Promise<boolean> {
  return Boolean(await loadKey());
}
