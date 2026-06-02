// kie.ai client — unified LLM + image + video generation gateway.
//
// 3 API shapes:
//   1. IMAGE/VIDEO: POST /api/v1/jobs/createTask (async, poll /jobs/recordInfo)
//   2. CHAT (Claude family): POST /claude/v1/messages (Anthropic Messages API)
//   3. CHAT (GPT-5): POST /codex/v1/responses (OpenAI Responses API)
//   4. CHAT (Gemini): POST /gemini-3.1-pro/v1/chat/completions (OpenAI Chat Completions)
//
// Auth: Authorization: Bearer <API_KEY> cho cả 4.
// Server-only — KHÔNG import vào client component.

import { getSettingOrEnv } from '@/lib/settings/api-keys';

export const KIE_AI_KEY_NAME = 'KIE_AI_API_KEY';

// Base URLs:
//   - BASE_URL = "https://api.kie.ai/api/v1" — dùng cho image/video (/jobs/...)
//   - ROOT_URL = "https://api.kie.ai"        — dùng cho chat (/claude/v1, /codex/v1, /gemini-*/v1)
// KIE_AI_BASE_URL env override: nếu set sẵn dạng "https://x/api/v1" thì strip
// "/api/v1" để derive root; nếu set dạng root thì giữ nguyên.
const BASE_URL = process.env.KIE_AI_BASE_URL ?? 'https://api.kie.ai/api/v1';
const ROOT_URL = BASE_URL.replace(/\/api\/v1\/?$/, '');

// ─── Model registry ───────────────────────────────────────────────────────

export interface KieModelOption {
  id: string;                 // slug dùng trong API
  label: string;              // hiển thị UI
  type: 'image' | 'video';
  description: string;
  /** Aspect ratios hỗ trợ — UI render dropdown */
  aspectRatios?: readonly string[];
  /** Resolutions hỗ trợ */
  resolutions?: readonly string[];
  /** Durations (video only) */
  durations?: readonly string[];
  /** Modes (vd grok-imagine có "normal" / "premium") */
  modes?: readonly string[];
  /** Có hỗ trợ image input (image-to-image, image-to-video)? */
  acceptsImageInput?: boolean;
  /** Cost reference $/job (estimate) */
  estimatedCost?: string;
}

// ─── IMAGE models ────────────────────────────────────────────────────────
export const IMAGE_MODELS: readonly KieModelOption[] = [
  {
    id: 'gpt-image-2-text-to-image',
    label: 'GPT Image 2',
    type: 'image',
    description: 'OpenAI · realistic, good for product shots',
    aspectRatios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4'],
    resolutions: ['1K', '2K', '4K'],
    estimatedCost: '~$0.04',
  },
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    type: 'image',
    description: 'Google Gemini Image · multi-panel comics, text-in-image tốt',
    aspectRatios: ['auto', '1:1', '16:9', '9:16'],
    resolutions: ['1K', '2K'],
    acceptsImageInput: true,
    estimatedCost: '~$0.04',
  },
  {
    id: 'flux-2/flex-text-to-image',
    label: 'Flux 2 Flex',
    type: 'image',
    description: 'Black Forest Labs · cheap, fast, OSS-friendly',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    resolutions: ['1K', '2K'],
    estimatedCost: '~$0.01',
  },
  {
    id: 'grok-imagine/text-to-image',
    label: 'Grok Imagine',
    type: 'image',
    description: 'xAI · cinematic, photographic, real-people friendly',
    aspectRatios: ['1:1', '16:9', '9:16', '3:2', '2:3'],
    estimatedCost: '~$0.05',
  },
] as const;

// ─── VIDEO models ────────────────────────────────────────────────────────
export const VIDEO_MODELS: readonly KieModelOption[] = [
  {
    id: 'grok-imagine/text-to-video',
    label: 'Grok Imagine (T2V)',
    type: 'video',
    description: 'xAI · text → video, cinematic',
    aspectRatios: ['16:9', '9:16', '2:3', '3:2', '1:1'],
    resolutions: ['480p', '720p'],
    durations: ['6', '10'],
    modes: ['normal', 'premium'],
    estimatedCost: '~$0.30',
  },
  {
    id: 'grok-imagine/image-to-video',
    label: 'Grok Imagine (I2V)',
    type: 'video',
    description: 'xAI · animate 1 ảnh sẵn có',
    aspectRatios: ['16:9', '9:16', '2:3', '3:2', '1:1'],
    resolutions: ['480p', '720p'],
    durations: ['6', '10'],
    modes: ['normal', 'premium'],
    acceptsImageInput: true,
    estimatedCost: '~$0.30',
  },
  {
    id: 'gemini-omni-video',
    label: 'Gemini Omni Video',
    type: 'video',
    description: 'Google · multi-modal input (image + audio + clip)',
    durations: ['4', '8'],
    acceptsImageInput: true,
    estimatedCost: '~$0.50',
  },
] as const;

export const ALL_MODELS = [...IMAGE_MODELS, ...VIDEO_MODELS] as const;

const MODEL_IDS = new Set<string>(ALL_MODELS.map((m) => m.id));

export function isValidKieModelId(s: string): boolean {
  return MODEL_IDS.has(s);
}

export function getModel(id: string): KieModelOption | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

// ─── API client ──────────────────────────────────────────────────────────

let cachedKey: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateKieKeyCache(): void {
  cachedKey = null;
  cachedAt = 0;
}

async function loadKey(): Promise<string | null> {
  if (cachedKey && Date.now() - cachedAt < CACHE_TTL_MS) return cachedKey;
  const key = await getSettingOrEnv(KIE_AI_KEY_NAME);
  cachedKey = key;
  cachedAt = Date.now();
  return key;
}

export async function isKieConfigured(): Promise<boolean> {
  return Boolean(await loadKey());
}

export interface KieCreateTaskParams {
  model: string;
  input: Record<string, unknown>;
  callBackUrl?: string;
}

export interface KieCreateTaskResult {
  taskId: string;
  raw: unknown; // full response — debug
}

/**
 * Create new generation task. Returns taskId for polling.
 * Throws nếu kie.ai trả non-200 hoặc body không có taskId.
 */
export async function createTask(
  params: KieCreateTaskParams
): Promise<KieCreateTaskResult> {
  const key = await loadKey();
  if (!key) {
    throw new Error('KIE_AI_API_KEY chưa cấu hình. Set qua /settings/integrations.');
  }

  const res = await fetch(`${BASE_URL}/jobs/createTask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(30_000),
  });

  const body = (await res.json().catch(() => ({}))) as {
    code?: number;
    msg?: string;
    message?: string;
    data?: { taskId?: string };
  };

  if (!res.ok || (body.code && body.code !== 200)) {
    const msg = body.msg || body.message || `HTTP ${res.status}`;
    throw new Error(`kie.ai createTask failed: ${msg}`);
  }

  const taskId = body.data?.taskId;
  if (!taskId) {
    throw new Error('kie.ai response thiếu data.taskId — check raw response');
  }

  return { taskId, raw: body };
}

export interface KieTaskInfo {
  status: 'pending' | 'running' | 'success' | 'failed';
  /** Output URLs — array vì 1 số model trả nhiều variants (vd MJ trả 4) */
  resultUrls: string[];
  /** Cost credits nếu kie.ai trả về */
  costCredits: number | null;
  errorMessage: string | null;
  raw: unknown;
}

/**
 * Query task status + result. Endpoint giả định theo kie.ai pattern phổ biến —
 * nếu sai thực tế, đổi URL ở đây 1 chỗ duy nhất.
 */
export async function getTaskInfo(taskId: string): Promise<KieTaskInfo> {
  const key = await loadKey();
  if (!key) throw new Error('KIE_AI_API_KEY chưa cấu hình');

  // Try common endpoint patterns. kie.ai chưa public docs cụ thể — start
  // với recordInfo (thấy nhắc trong general docs).
  const url = `${BASE_URL}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(20_000),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok || (body.code && body.code !== 200)) {
    const msg = body.msg || body.message || `HTTP ${res.status}`;
    throw new Error(`kie.ai getTaskInfo failed: ${msg}`);
  }

  return parseTaskInfo(body);
}

// ─── Response parser — handle multiple possible field name patterns ─────

interface RawTaskBody {
  data?: {
    state?: string;
    status?: string;
    successFlag?: number;
    completeTime?: number;
    failTime?: number;
    errorMsg?: string;
    errorMessage?: string;
    failCode?: string;
    cost?: number;
    creditsCost?: number;
    resultJson?: string;
    response?: Record<string, unknown>;
    output?: Record<string, unknown> | string[];
    result?: Record<string, unknown> | string;
    resultUrls?: string[];
  };
  code?: number;
  msg?: string;
}

/**
 * Parse status + result URLs từ raw kie.ai response. kie.ai có nhiều
 * naming conventions tuỳ model — handle với fallback ladder.
 */
function parseTaskInfo(raw: unknown): KieTaskInfo {
  const body = (raw ?? {}) as RawTaskBody;
  const data = body.data ?? {};

  // Status parsing — try multiple field names
  let status: KieTaskInfo['status'] = 'pending';
  const rawStatus = (data.status ?? data.state ?? '').toString().toLowerCase();
  if (
    rawStatus === 'success' ||
    rawStatus === 'completed' ||
    rawStatus === 'succeeded' ||
    data.successFlag === 1
  ) {
    status = 'success';
  } else if (
    rawStatus === 'failed' ||
    rawStatus === 'error' ||
    rawStatus === 'fail'
  ) {
    status = 'failed';
  } else if (
    rawStatus === 'running' ||
    rawStatus === 'processing' ||
    rawStatus === 'in_progress'
  ) {
    status = 'running';
  }

  // Result URL parsing — try many possible paths
  const urls: string[] = [];

  const tryAddUrl = (v: unknown): void => {
    if (typeof v === 'string' && v.startsWith('http')) urls.push(v);
    else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string' && item.startsWith('http')) urls.push(item);
        else if (item && typeof item === 'object') {
          // Maybe object like { url: '...' }
          const u = (item as Record<string, unknown>).url;
          if (typeof u === 'string' && u.startsWith('http')) urls.push(u);
        }
      }
    }
  };

  // Try most common locations:
  tryAddUrl(data.resultUrls);
  if (data.output) {
    if (Array.isArray(data.output)) tryAddUrl(data.output);
    else {
      tryAddUrl((data.output as Record<string, unknown>).image_urls);
      tryAddUrl((data.output as Record<string, unknown>).images);
      tryAddUrl((data.output as Record<string, unknown>).video_url);
      tryAddUrl((data.output as Record<string, unknown>).url);
      tryAddUrl((data.output as Record<string, unknown>).urls);
    }
  }
  if (data.response) {
    tryAddUrl((data.response as Record<string, unknown>).image_urls);
    tryAddUrl((data.response as Record<string, unknown>).video_url);
    tryAddUrl((data.response as Record<string, unknown>).url);
  }
  if (data.result) {
    if (typeof data.result === 'string') tryAddUrl(data.result);
    else {
      tryAddUrl((data.result as Record<string, unknown>).image_urls);
      tryAddUrl((data.result as Record<string, unknown>).url);
    }
  }
  // resultJson is stringified — parse + recurse
  if (typeof data.resultJson === 'string') {
    try {
      const parsed = JSON.parse(data.resultJson) as Record<string, unknown>;
      tryAddUrl(parsed.image_urls);
      tryAddUrl(parsed.video_url);
      tryAddUrl(parsed.url);
      tryAddUrl(parsed.resultUrls);
    } catch {
      /* ignore */
    }
  }

  const costCredits =
    typeof data.cost === 'number'
      ? data.cost
      : typeof data.creditsCost === 'number'
        ? data.creditsCost
        : null;

  const errorMessage =
    data.errorMsg || data.errorMessage || (status === 'failed' ? 'Unknown error' : null);

  return { status, resultUrls: urls, costCredits, errorMessage, raw };
}

// ════════════════════════════════════════════════════════════════════════
// CHAT (LLM) — 3 API shapes tuỳ model family
// ════════════════════════════════════════════════════════════════════════

/**
 * kie.ai serve 3 dialect khác nhau qua các sub-endpoint khác nhau:
 *   - 'anthropic' → /claude/v1/messages         (Anthropic Messages API)
 *   - 'codex'     → /codex/v1/responses          (OpenAI Responses API)
 *   - 'gemini'    → /<model>/v1/chat/completions (OpenAI Chat Completions)
 */
export type ChatFamily = 'anthropic' | 'codex' | 'gemini';

export interface ChatModelOption {
  id: string;
  label: string;
  family: ChatFamily;
  description: string;
  /** Token cap output mặc định nếu caller không override */
  defaultMaxTokens: number;
  /** Có hỗ trợ thinking/reasoning (tăng quality, tốn thêm credit) */
  supportsThinking?: boolean;
  /** Cost reference (per million tokens hoặc per request, tuỳ model) */
  pricingNote?: string;
}

/**
 * Curated chat model list. Slug khớp endpoint kie.ai docs:
 *   https://docs.kie.ai/market/claude/*
 *   https://docs.kie.ai/market/chat/gpt-5-5
 *   https://docs.kie.ai/market/gemini/gemini-3-1-pro
 */
export const CHAT_MODELS: readonly ChatModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    family: 'anthropic',
    description: 'Anthropic · cân bằng cost + quality. Default cho hầu hết skill.',
    defaultMaxTokens: 8192,
    supportsThinking: true,
    pricingNote: '~0.25 credits/req nhỏ',
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    family: 'anthropic',
    description: 'Anthropic · model mạnh nhất, creative + reasoning sâu.',
    defaultMaxTokens: 8192,
    supportsThinking: true,
    pricingNote: 'cao — dùng cho task khó',
  },
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    family: 'anthropic',
    description: 'Anthropic · Opus phiên bản trước, rẻ hơn 4.8 chút.',
    defaultMaxTokens: 8192,
    supportsThinking: true,
  },
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4.6',
    family: 'anthropic',
    description: 'Anthropic · Opus older, fallback.',
    defaultMaxTokens: 8192,
    supportsThinking: true,
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    family: 'anthropic',
    description: 'Anthropic · nhanh + rẻ. Cho task đơn giản, high volume.',
    defaultMaxTokens: 8192,
    supportsThinking: false,
    pricingNote: 'rẻ nhất Anthropic',
  },
  {
    id: 'gpt-5-5',
    label: 'GPT-5.5',
    family: 'codex',
    description: 'OpenAI · multimodal + web search + reasoning effort tuỳ chọn.',
    defaultMaxTokens: 8192,
    supportsThinking: true,
    pricingNote: '~0.48 credits/req',
  },
  {
    id: 'gemini-3.1-pro',
    label: 'Gemini 3.1 Pro',
    family: 'gemini',
    description: 'Google · long context, multimodal, Google Search tool.',
    defaultMaxTokens: 8192,
    supportsThinking: true,
    pricingNote: '~27 credits/req',
  },
] as const;

const CHAT_MODEL_IDS = new Set<string>(CHAT_MODELS.map((m) => m.id));

export function isValidChatModelId(s: string): boolean {
  return CHAT_MODEL_IDS.has(s);
}

export function getChatModel(id: string): ChatModelOption | undefined {
  return CHAT_MODELS.find((m) => m.id === id);
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessageInput {
  role: ChatRole;
  content: string;
}

export interface ChatCompleteParams {
  model: string;
  messages: ChatMessageInput[];
  /** Override defaultMaxTokens; clamp ở model.defaultMaxTokens nếu vượt. */
  maxTokens?: number;
  /** Bật thinking/reasoning effort (chỉ áp dụng cho model hỗ trợ) */
  thinking?: boolean;
}

export interface ChatCompleteResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  /** Model id thực tế kie.ai dùng (có thể khác alias caller gửi) */
  model: string;
  /** Credits kie.ai trừ cho request này — null nếu kie không trả về */
  creditsConsumed: number | null;
  /** 'stop' | 'length' | 'tool_use' | 'error' | 'content_filter' | ... */
  finishReason: string;
  raw: unknown;
}

/**
 * Dispatch chat request tới kie.ai theo family của model.
 * Throws nếu key chưa cấu hình, model id không valid, hoặc kie.ai trả lỗi.
 */
export async function chatComplete(
  params: ChatCompleteParams
): Promise<ChatCompleteResult> {
  const model = getChatModel(params.model);
  if (!model) {
    throw new Error(`Unknown chat model: ${params.model}`);
  }
  const key = await loadKey();
  if (!key) {
    throw new Error('KIE_AI_API_KEY chưa cấu hình. Set qua /settings/integrations.');
  }

  const maxTokens = Math.min(
    params.maxTokens ?? model.defaultMaxTokens,
    model.defaultMaxTokens
  );

  switch (model.family) {
    case 'anthropic':
      return chatViaAnthropic(key, model, params.messages, maxTokens, params.thinking);
    case 'codex':
      return chatViaCodex(key, model, params.messages, maxTokens, params.thinking);
    case 'gemini':
      return chatViaGemini(key, model, params.messages, maxTokens, params.thinking);
  }
}

// ─── Anthropic Messages API (Claude family) ──────────────────────────────
//
// POST {ROOT}/claude/v1/messages
//   { model, messages: [{role:'user'|'assistant', content:string}],
//     system?: string, max_tokens, thinkingFlag?, stream:false }
//
// Anthropic format khác OpenAI: system message KHÔNG nằm trong messages[],
// mà ở field `system` riêng. Nếu caller gửi role='system', extract ra.

async function chatViaAnthropic(
  key: string,
  model: ChatModelOption,
  messages: ChatMessageInput[],
  maxTokens: number,
  thinking?: boolean
): Promise<ChatCompleteResult> {
  // Tách system ra khỏi message array
  const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
  const convoMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const body: Record<string, unknown> = {
    model: model.id,
    messages: convoMessages,
    max_tokens: maxTokens,
    stream: false,
  };
  if (systemParts.length > 0) body.system = systemParts.join('\n\n');
  if (thinking && model.supportsThinking) body.thinkingFlag = true;

  const res = await fetch(`${ROOT_URL}/claude/v1/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (raw.error as { message?: string } | undefined)?.message
      ?? (raw.msg as string | undefined)
      ?? (raw.message as string | undefined)
      ?? `HTTP ${res.status}`;
    throw new Error(`kie.ai (Anthropic) failed: ${msg}`);
  }

  // Parse content blocks — Anthropic trả `content` là ARRAY của blocks
  const contentBlocks = Array.isArray(raw.content)
    ? (raw.content as Array<Record<string, unknown>>)
    : [];
  const textParts = contentBlocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string);
  const content = textParts.join('\n').trim();

  const usage = (raw.usage as Record<string, unknown> | undefined) ?? {};
  return {
    content,
    tokensIn: Number(usage.input_tokens ?? 0),
    tokensOut: Number(usage.output_tokens ?? 0),
    model: (raw.model as string | undefined) ?? model.id,
    creditsConsumed:
      typeof raw.credits_consumed === 'number' ? raw.credits_consumed : null,
    finishReason: (raw.stop_reason as string | undefined) ?? 'stop',
    raw,
  };
}

// ─── OpenAI Responses API (GPT-5 family / Codex) ────────────────────────
//
// POST {ROOT}/codex/v1/responses
//   { model, input: [{role, content:[{type:'input_text',text}]}],
//     reasoning?:{effort:'high'}, stream:false }
// Response: { output: [{type:'reasoning'},{type:'message',content:[{type:'output_text',text}]}],
//             usage:{input_tokens,output_tokens}, status }

async function chatViaCodex(
  key: string,
  model: ChatModelOption,
  messages: ChatMessageInput[],
  maxTokens: number,
  thinking?: boolean
): Promise<ChatCompleteResult> {
  // Convert messages → Responses API input format. System message thành
  // 1 turn riêng (Responses API support nhiều role).
  const input = messages.map((m) => ({
    role: m.role,
    content: [{ type: 'input_text', text: m.content }],
  }));

  const body: Record<string, unknown> = {
    model: model.id,
    input,
    max_output_tokens: maxTokens,
    stream: false,
  };
  if (thinking && model.supportsThinking) {
    body.reasoning = { effort: 'high' };
  }

  const res = await fetch(`${ROOT_URL}/codex/v1/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (raw.error as { message?: string } | undefined)?.message
      ?? (raw.msg as string | undefined)
      ?? (raw.message as string | undefined)
      ?? `HTTP ${res.status}`;
    throw new Error(`kie.ai (Codex) failed: ${msg}`);
  }

  // Find first message block trong output array
  const output = Array.isArray(raw.output)
    ? (raw.output as Array<Record<string, unknown>>)
    : [];
  const messageBlock = output.find((b) => b.type === 'message');
  const blocks = Array.isArray(messageBlock?.content)
    ? (messageBlock.content as Array<Record<string, unknown>>)
    : [];
  const content = blocks
    .filter((b) => b.type === 'output_text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim();

  const usage = (raw.usage as Record<string, unknown> | undefined) ?? {};
  return {
    content,
    tokensIn: Number(usage.input_tokens ?? 0),
    tokensOut: Number(usage.output_tokens ?? 0),
    model: (raw.model as string | undefined) ?? model.id,
    creditsConsumed:
      typeof raw.credits_consumed === 'number' ? raw.credits_consumed : null,
    finishReason: (raw.status as string | undefined) ?? 'completed',
    raw,
  };
}

// ─── OpenAI Chat Completions (Gemini 3.1 Pro) ────────────────────────────
//
// POST {ROOT}/{model}/v1/chat/completions
//   { messages:[{role,content:[{type:'text',text}] | string}],
//     stream:false, include_thoughts?, reasoning_effort?:'high' }
// Response: { choices:[{message:{role:'assistant',content:string}, finish_reason}],
//             usage:{prompt_tokens,completion_tokens,total_tokens} }

async function chatViaGemini(
  key: string,
  model: ChatModelOption,
  messages: ChatMessageInput[],
  maxTokens: number,
  thinking?: boolean
): Promise<ChatCompleteResult> {
  // Gemini path dùng model id trong URL — gemini-3.1-pro slug có thể đổi
  // nếu kie.ai release version mới. Sub the slug.
  const url = `${ROOT_URL}/${model.id}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model: model.id,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: maxTokens,
    stream: false,
  };
  if (thinking && model.supportsThinking) {
    body.include_thoughts = true;
    body.reasoning_effort = 'high';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (raw.error as { message?: string } | undefined)?.message
      ?? (raw.msg as string | undefined)
      ?? (raw.message as string | undefined)
      ?? `HTTP ${res.status}`;
    throw new Error(`kie.ai (Gemini) failed: ${msg}`);
  }

  const choices = Array.isArray(raw.choices)
    ? (raw.choices as Array<Record<string, unknown>>)
    : [];
  const firstChoice = choices[0];
  const msgField = firstChoice?.message as
    | { content?: unknown; role?: string }
    | undefined;

  // content có thể là string hoặc array of blocks (multimodal)
  let content = '';
  if (typeof msgField?.content === 'string') {
    content = msgField.content;
  } else if (Array.isArray(msgField?.content)) {
    content = (msgField.content as Array<Record<string, unknown>>)
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n');
  }
  content = content.trim();

  const usage = (raw.usage as Record<string, unknown> | undefined) ?? {};
  return {
    content,
    tokensIn: Number(usage.prompt_tokens ?? 0),
    tokensOut: Number(usage.completion_tokens ?? 0),
    model: (raw.model as string | undefined) ?? model.id,
    creditsConsumed:
      typeof raw.credits_consumed === 'number' ? raw.credits_consumed : null,
    finishReason: (firstChoice?.finish_reason as string | undefined) ?? 'stop',
    raw,
  };
}
