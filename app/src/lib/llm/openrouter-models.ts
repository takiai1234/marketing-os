// Client-safe model list — không import từ openrouter.ts (file đó dùng
// pg/OpenAI SDK chỉ server). Client component (rewrite-dialog) cần list
// model để render dropdown → import từ FILE NÀY.
//
// openrouter.ts re-export từ đây để server code dùng cùng nguồn.
// Khi update model list, sửa Ở ĐÂY và migration db.

// 9Router model ID convention:
//   cc/ = Claude Code (Claude Max subscription) → cc/claude-sonnet-4-5-20250929
//   cx/ = OpenAI Codex (ChatGPT Pro subscription) → cx/gpt-5.2-codex
// Kết nối OAuth trong 9Router dashboard → Providers → Connect Claude Code / Connect Codex

export const AVAILABLE_MODELS = [
  // ─── CLAUDE MAX (Claude Code subscription) ─────────────────────────────
  {
    id: 'cc/claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5',
    description:
      'Claude Max · Subscription · Cân bằng tốc độ/chất lượng — mặc định cho hầu hết task.',
    provider: 'anthropic',
  },
  {
    id: 'cc/claude-opus-4-5-20251101',
    label: 'Claude Opus 4.5',
    description:
      'Claude Max · Subscription · Flagship reasoning + creative writing sâu nhất. Task phức tạp, nội dung dài.',
    provider: 'anthropic',
  },
  {
    id: 'cc/claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    description:
      'Claude Max · Subscription · Nhanh nhất — đủ cho task đơn giản hoặc high-volume.',
    provider: 'anthropic',
  },

  // ─── CHATGPT PRO (OpenAI Codex subscription) ───────────────────────────
  {
    id: 'cx/gpt-5.2-codex',
    label: 'GPT-5.2 Codex',
    description:
      'ChatGPT Pro · Subscription · Model coding mới nhất. Structured output + function calling tốt.',
    provider: 'openai',
  },
  {
    id: 'cx/gpt-5.1-codex-max',
    label: 'GPT-5.1 Codex Max',
    description:
      'ChatGPT Pro · Subscription · Context tối đa. Long document, phân tích sâu.',
    provider: 'openai',
  },
  {
    id: 'cx/gpt-5.2',
    label: 'GPT-5.2',
    description:
      'ChatGPT Pro · Subscription · GPT-5.2 general — task chung, multimodal.',
    provider: 'openai',
  },
] as const;

export type OpenRouterModelId = (typeof AVAILABLE_MODELS)[number]['id'];

const VALID_MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map((m) => m.id));

export function isValidModelId(s: string): boolean {
  return VALID_MODEL_IDS.has(s);
}
