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
import { isValidModelId } from './openrouter-models';

// Key trong app_setting table — admin paste qua UI ghi vào đây
export const OPENROUTER_KEY_NAME = 'OPENROUTER_API_KEY';

// Model list được CLIENT-SAFE — tách sang openrouter-models.ts (không
// import pg/openai SDK). Re-export tại đây cho server caller dùng cùng nguồn.
// Lý do: rewrite-dialog (client) cần AVAILABLE_MODELS để render dropdown.
// Nếu import từ file này, Turbopack pull pg vào client bundle → fail "Can't
// resolve 'tls'". Same pattern với Top Reach feature trước đây (commit 245f452).
export {
  AVAILABLE_MODELS,
  isValidModelId,
  type OpenRouterModelId,
} from './openrouter-models';

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
