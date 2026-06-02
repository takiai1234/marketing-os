// Anthropic Claude SDK wrapper — singleton + helpers.
// Server-only — KHÔNG import vào client component (sẽ pull key vào browser).

import Anthropic from '@anthropic-ai/sdk';

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

declare global {
  // eslint-disable-next-line no-var
  var __anthropic_client: Anthropic | undefined;
}

/**
 * Returns Anthropic client. Throws if ANTHROPIC_API_KEY missing — caller
 * phải check `isAnthropicConfigured()` trước nếu muốn graceful degrade UI.
 */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set. Set in .env.production.'
    );
  }
  if (!globalThis.__anthropic_client) {
    globalThis.__anthropic_client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return globalThis.__anthropic_client;
}

/** Feature flag — UI dùng để show/hide nút "Chat". KHÔNG throw nếu thiếu. */
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
