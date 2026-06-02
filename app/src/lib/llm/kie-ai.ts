// kie.ai client — image + video generation gateway.
// Universal endpoint POST /api/v1/jobs/createTask cho mọi model.
// Polling qua GET /api/v1/jobs/recordInfo?taskId=X (giả định — confirm sau).
//
// Auth: Authorization: Bearer <API_KEY>.
// Async pattern: createTask trả taskId ngay → client tự poll.

import { getSettingOrEnv } from '@/lib/settings/api-keys';

export const KIE_AI_KEY_NAME = 'KIE_AI_API_KEY';

// Base URL — config được qua env nếu kie.ai đổi domain
const BASE_URL = process.env.KIE_AI_BASE_URL ?? 'https://api.kie.ai/api/v1';

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
