// Client-safe model list — không import từ openrouter.ts (file đó dùng
// pg/OpenAI SDK chỉ server). Client component (rewrite-dialog) cần list
// model để render dropdown → import từ FILE NÀY.
//
// openrouter.ts re-export từ đây để server code dùng cùng nguồn.
// Khi update model list, sửa Ở ĐÂY và migration db.

// OpenRouter slug convention (verified qua https://openrouter.ai/anthropic):
//   - Specific version (vd anthropic/claude-sonnet-4.6) → safest, dùng trực tiếp
//   - "latest" alias (vd anthropic/claude-sonnet-latest) tồn tại nhưng API
//     có lúc reject với "is not a valid model ID" — KHÔNG ĐÁNG TIN cho production.
//
// Quy tắc: dùng SPECIFIC VERSION. Khi Anthropic ra version mới (4.7 → 4.8),
// update slug ở đây + migration để remap session.model. An toàn hơn dựa vào
// alias dynamic.
export const AVAILABLE_MODELS = [
  // ─── ANTHROPIC ─────────────────────────────────────────────────────────
  {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    description:
      'Anthropic · ~$3/$15 · 1M context · Cân bằng cost+quality, default cho hầu hết task.',
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
    id: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
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
