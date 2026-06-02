// OpenRouter — unified API gateway cho LLMs (Claude / GPT / Gemini / Grok / OSS).
// OpenAI-compatible format → dùng `openai` SDK với baseURL override.
//
// 1 API key, nhiều model. User chọn model per session (Claude cho creative,
// GPT cho structured, Gemini cho long context, etc.). Pricing ~same với
// direct Anthropic, có markup nhỏ ~5%.
//
// Server-only — KHÔNG import vào client component.

import OpenAI from 'openai';
import { getSettingOrEnv } from '@/lib/settings/api-keys';

// Key trong app_setting table — admin paste qua UI ghi vào đây
export const OPENROUTER_KEY_NAME = 'OPENROUTER_API_KEY';

// Curated model list — cover top use cases. Slug khớp OpenRouter docs
// (xem https://openrouter.ai/models). Pricing tham khảo USD/1M tokens.
export const AVAILABLE_MODELS = [
  {
    id: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    description: 'Anthropic · ~$3/$15. Cân bằng cost + quality cho hầu hết skill.',
    provider: 'anthropic',
  },
  {
    id: 'anthropic/claude-opus-4.5',
    label: 'Claude Opus 4.5',
    description: 'Anthropic · ~$15/$75. Tốt nhất cho creative writing dài, phân tích sâu.',
    provider: 'anthropic',
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    description: 'OpenAI · ~$2.5/$10. Multimodal, structured output, function calling tốt.',
    provider: 'openai',
  },
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'OpenAI · ~$0.15/$0.6. Rẻ nhất, fast — cho high-volume hoặc test.',
    provider: 'openai',
  },
  {
    id: 'google/gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    description: 'Google · ~$1.25/$5. Context window 2M tokens — analyze tài liệu dài.',
    provider: 'google',
  },
  {
    id: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    description: 'Google · ~$0.075/$0.3. Cực rẻ, fast, multimodal.',
    provider: 'google',
  },
  {
    id: 'x-ai/grok-3',
    label: 'Grok 3',
    description: 'xAI · ~$3/$15. Real-time data từ X (Twitter).',
    provider: 'xai',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B',
    description: 'Meta · ~$0.6/$0.6. Open-source, balanced cost.',
    provider: 'meta',
  },
] as const;

export type OpenRouterModelId = (typeof AVAILABLE_MODELS)[number]['id'];

const VALID_MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map((m) => m.id));

export function isValidModelId(s: string): s is OpenRouterModelId {
  return VALID_MODEL_IDS.has(s);
}

// In-memory cache cho key — invalidate khi admin update qua UI (TTL 60s safety)
let cachedKey: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateOpenRouterKeyCache(): void {
  cachedKey = null;
  cachedAt = 0;
}

async function loadKey(): Promise<string | null> {
  if (cachedKey && Date.now() - cachedAt < CACHE_TTL_MS) return cachedKey;
  const key = await getSettingOrEnv(OPENROUTER_KEY_NAME);
  cachedKey = key;
  cachedAt = Date.now();
  return key;
}

/**
 * Returns OpenAI-compatible client cấu hình cho OpenRouter.
 * Throws nếu key chưa có ở DB lẫn env. Caller dùng `isOpenRouterConfigured()`
 * trước để graceful degrade UI.
 *
 * Headers OpenRouter-specific:
 *   HTTP-Referer: dùng cho leaderboard + analytics OpenRouter (tuỳ chọn)
 *   X-Title:      dùng app name cho dashboard OR (tuỳ chọn)
 */
export async function getOpenRouter(): Promise<OpenAI> {
  const key = await loadKey();
  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY chưa được cấu hình. Admin vào /settings/integrations để set.'
    );
  }
  return new OpenAI({
    apiKey: key,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.APP_URL ?? 'https://marketing-os.local',
      'X-Title': 'Marketing OS',
    },
  });
}

export async function isOpenRouterConfigured(): Promise<boolean> {
  return Boolean(await loadKey());
}
