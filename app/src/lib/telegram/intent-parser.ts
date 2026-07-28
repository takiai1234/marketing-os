// Dùng LLM (Haiku — rẻ, nhanh) để parse câu hỏi tự nhiên → intent có cấu trúc.
// Intent sau đó được dùng bởi query-executor để fetch đúng data từ DB.

import { chatComplete } from '@/lib/llm/openrouter';

export type MetricType = 'kpi' | 'channels' | 'ads' | 'posts' | 'messages';
export type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | 'this_month' | 'last_month' | 'custom';

export interface Intent {
  type: 'data_query' | 'unknown';
  metric: MetricType;
  datePreset: DatePreset;
  /** Tên kênh cụ thể nếu user hỏi về 1 kênh */
  channelName?: string;
  /** Tag/nhóm kênh nếu hỏi theo tag */
  tagSlug?: string;
}

const SYSTEM_PROMPT = `Bạn là assistant phân tích câu hỏi marketing.
Trả về JSON (chỉ JSON, không giải thích) với schema:
{
  "type": "data_query" | "unknown",
  "metric": "kpi" | "channels" | "ads" | "posts" | "messages",
  "datePreset": "today" | "yesterday" | "7d" | "30d" | "this_month" | "last_month",
  "channelName": string | null,
  "tagSlug": null
}

Quy tắc chọn metric:
- kpi: hỏi tổng quan reach, leads, ER, followers, conversions
- channels: hỏi so sánh các kênh, top kênh, kênh nào tốt nhất
- ads: hỏi quảng cáo, chi tiêu, CPA, CPM, impressions, clicks
- posts: hỏi bài đăng, nội dung, bài viral
- messages: hỏi tin nhắn, inbox, hội thoại

Quy tắc chọn datePreset:
- "hôm nay" → today
- "hôm qua" → yesterday
- "tuần này" / "7 ngày" → 7d
- "tháng này" → this_month
- "tháng trước" → last_month
- "30 ngày" / "tháng qua" → 30d
- Mặc định nếu không rõ → 7d

Nếu câu hỏi không liên quan marketing data → type: "unknown".`;

export async function parseIntent(question: string): Promise<Intent> {
  const result = await chatComplete({
    model: 'cc/claude-haiku-4-5-20251001',
    maxTokens: 256,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: question },
    ],
  });

  const raw = result.content.trim().replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(raw) as {
    type: string;
    metric: string;
    datePreset: string;
    channelName?: string | null;
    tagSlug?: string | null;
  };

  return {
    type: parsed.type === 'data_query' ? 'data_query' : 'unknown',
    metric: (parsed.metric as MetricType) ?? 'kpi',
    datePreset: (parsed.datePreset as DatePreset) ?? '7d',
    channelName: parsed.channelName ?? undefined,
    tagSlug: parsed.tagSlug ?? undefined,
  };
}
