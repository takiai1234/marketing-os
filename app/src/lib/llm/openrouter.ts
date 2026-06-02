// OpenRouter — unified API gateway cho LLMs (Claude / GPT / Gemini / Grok / OSS).
// OpenAI-compatible format → dùng `openai` SDK với baseURL override.
//
// 1 API key, nhiều model. User chọn model per session (Claude cho creative,
// GPT cho structured, Gemini cho long context, etc.). Pricing ~same với
// direct Anthropic, có markup nhỏ ~5%.
//
// Server-only — KHÔNG import vào client component.
//
// MULTI-MODAL: OpenRouter chấp nhận OpenAI Chat Completions content blocks
// dạng [{type:'text',text}, {type:'image_url',image_url:{url}}] — work cho
// mọi vision model (Claude/GPT-4o/Gemini). String content vẫn backward-compat.

import OpenAI from 'openai';
import { getSettingOrEnv } from '@/lib/settings/api-keys';

// Key trong app_setting table — admin paste qua UI ghi vào đây
export const OPENROUTER_KEY_NAME = 'OPENROUTER_API_KEY';

// Curated FLAGSHIP model list — top-tier mọi family (June 2026).
// Slug đã verify qua https://openrouter.ai/api/v1/models. Pricing USD/1M tokens.
// Đã loại model rẻ thấp (gpt-4o-mini, gemini-flash-lite, llama) — chỉ giữ
// 1 budget option (Haiku) cho task đơn giản.
export const AVAILABLE_MODELS = [
  // ─── ANTHROPIC ─────────────────────────────────────────────────────────
  {
    id: 'anthropic/claude-sonnet-latest',
    label: 'Claude Sonnet (latest)',
    description:
      'Anthropic · ~$3/$15 · 1M context · Cân bằng cost+quality, default cho hầu hết task. Auto-update lên Sonnet mới nhất.',
    provider: 'anthropic',
  },
  {
    id: 'anthropic/claude-opus-4.8',
    label: 'Claude Opus 4.8',
    description:
      'Anthropic · ~$5/$25 · 1M context · Flagship reasoning + creative writing sâu nhất. Dùng cho task khó / long content.',
    provider: 'anthropic',
  },
  {
    id: 'anthropic/claude-opus-4.8-fast',
    label: 'Claude Opus 4.8 (fast)',
    description:
      'Anthropic · ~$10/$50 · 1M context · Cùng quality Opus 4.8 nhưng latency thấp hơn (premium cho real-time).',
    provider: 'anthropic',
  },
  {
    id: 'anthropic/claude-haiku-latest',
    label: 'Claude Haiku (latest)',
    description:
      'Anthropic · ~$1/$5 · 200K context · Nhanh + rẻ, đủ cho task đơn giản hoặc high-volume.',
    provider: 'anthropic',
  },

  // ─── OPENAI ────────────────────────────────────────────────────────────
  {
    id: 'openai/gpt-5.5',
    label: 'GPT-5.5',
    description:
      'OpenAI · ~$5/$30 · 1.05M context · Flagship balanced, multimodal + structured output + function calling tốt.',
    provider: 'openai',
  },
  {
    id: 'openai/gpt-5.5-pro',
    label: 'GPT-5.5 Pro',
    description:
      'OpenAI · ~$30/$180 · 1.05M context · Top reasoning. RẤT đắt — chỉ dùng cho task cần độ chính xác tối đa.',
    provider: 'openai',
  },

  // ─── GOOGLE ────────────────────────────────────────────────────────────
  {
    id: 'google/gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    description:
      'Google · ~$1.5/$9 · 1M context · Multimodal mạnh, vision + audio, latency thấp.',
    provider: 'google',
  },

  // ─── XAI ───────────────────────────────────────────────────────────────
  {
    id: 'x-ai/grok-4.20',
    label: 'Grok 4.20',
    description:
      'xAI · ~$1.25/$2.5 · 2M context · Context window LỚN NHẤT (2M tokens). Real-time data từ X (Twitter), rẻ bất ngờ.',
    provider: 'xai',
  },
] as const;

export type OpenRouterModelId = (typeof AVAILABLE_MODELS)[number]['id'];

const VALID_MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map((m) => m.id));

export function isValidModelId(s: string): boolean {
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
 * Throws nếu key chưa có ở DB lẫn env.
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

// ════════════════════════════════════════════════════════════════════════
// CHAT WRAPPER với multi-modal content
// ════════════════════════════════════════════════════════════════════════

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatTextBlock {
  type: 'text';
  text: string;
}

export interface ChatImageBlock {
  type: 'image';
  /** Data URL (data:image/...;base64,...) hoặc HTTPS URL public */
  dataUrl: string;
  mediaType?: string;
}

export type ChatContentBlock = ChatTextBlock | ChatImageBlock;

export interface ChatMessageInput {
  role: ChatRole;
  /**
   * Plain string giữ backward-compat. Array of blocks cho multi-modal
   * (ảnh đính kèm). OpenRouter format Chat Completions native support.
   */
  content: string | ChatContentBlock[];
}

export interface ChatCompleteParams {
  model: string;
  messages: ChatMessageInput[];
  maxTokens?: number;
}

export interface ChatCompleteResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  finishReason: string;
}

/**
 * Convert ChatContentBlock[] → OpenAI Chat Completions content array.
 *   text  → {type:'text', text:'...'}
 *   image → {type:'image_url', image_url:{url:'<data url>'}}
 * Return string nếu chỉ có 1 text block (compact body).
 */
function toOpenAiContent(
  content: string | ChatContentBlock[]
): string | Array<Record<string, unknown>> {
  if (typeof content === 'string') return content;
  const first = content[0];
  if (content.length === 1 && first && first.type === 'text') return first.text;
  return content.map((b): Record<string, unknown> => {
    if (b.type === 'image') {
      return { type: 'image_url', image_url: { url: b.dataUrl } };
    }
    return { type: 'text', text: b.text };
  });
}

/**
 * Chat completion qua OpenRouter — dispatch tới model nào tuỳ caller.
 * Throws nếu key thiếu hoặc OpenRouter trả lỗi.
 *
 * Trả normalized result {content, tokensIn, tokensOut, model, finishReason}
 * để caller không phải biết shape OpenAI.
 */
export async function chatComplete(
  params: ChatCompleteParams
): Promise<ChatCompleteResult> {
  if (!isValidModelId(params.model)) {
    throw new Error(`Unknown chat model: ${params.model}`);
  }

  const client = await getOpenRouter();

  // OpenAI SDK types là strict. Cast qua any cho image_url content cũng ổn
  // vì OpenRouter pass-through đến vendor mà không validate shape.
  const reqStart = Date.now();
  try {
    const response = await client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 8192,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: params.messages.map((m) => ({
        role: m.role,
        content: toOpenAiContent(m.content),
      })) as any,
    });

    const elapsedMs = Date.now() - reqStart;
    const choice = response.choices[0];
    const content = choice?.message?.content ?? '';
    const tokensIn = response.usage?.prompt_tokens ?? 0;
    const tokensOut = response.usage?.completion_tokens ?? 0;

    if (!content) {
      console.error(
        `[openrouter] EMPTY-CONTENT model=${params.model} elapsed=${elapsedMs}ms ` +
          `tokens=${tokensIn}/${tokensOut} finish=${choice?.finish_reason ?? '?'}`
      );
    } else {
      console.log(
        `[openrouter] OK model=${params.model} elapsed=${elapsedMs}ms tokens=${tokensIn}/${tokensOut}`
      );
    }

    return {
      content,
      tokensIn,
      tokensOut,
      model: response.model ?? params.model,
      finishReason: choice?.finish_reason ?? 'stop',
    };
  } catch (err) {
    const elapsedMs = Date.now() - reqStart;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[openrouter] FAIL model=${params.model} elapsed=${elapsedMs}ms err=${msg}`
    );
    throw err;
  }
}
