// POST /api/settings/integrations/openrouter/test
// Verify key bằng cách gọi 9Router với Claude Haiku (nhanh nhất) + max_tokens=10.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { getOpenRouter, AVAILABLE_MODELS } from '@/lib/llm/openrouter';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let client;
  try {
    client = await getOpenRouter();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Dùng Claude Haiku (subscription) để test — nhanh, không tốn token thật.
  const testModel =
    AVAILABLE_MODELS.find((m) => m.id === 'cc/claude-haiku-4-5-20251001')?.id ??
    AVAILABLE_MODELS[0].id;

  try {
    const response = await client.chat.completions.create({
      model: testModel,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }],
    });

    const choice = response.choices[0];
    return NextResponse.json({
      ok: true,
      model: response.model,
      usage: {
        tokensIn: response.usage?.prompt_tokens ?? 0,
        tokensOut: response.usage?.completion_tokens ?? 0,
      },
      stopReason: choice?.finish_reason ?? 'unknown',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '9Router API error';
    let hint = '';
    if (msg.includes('401') || msg.includes('Invalid API key') || msg.includes('Unauthorized')) {
      hint = ' (Key sai — copy lại từ 9Router dashboard)';
    } else if (msg.includes('429') || msg.includes('rate')) {
      hint = ' (Hit rate limit — đợi vài phút hoặc kiểm tra quota subscription)';
    } else if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('connect')) {
      hint = ' (Không kết nối được 9Router — kiểm tra NINE_ROUTER_URL và container đang chạy)';
    } else if (msg.includes('quota') || msg.includes('exhausted')) {
      hint = ' (Hết quota subscription — đợi reset 5 giờ hoặc dùng model khác)';
    }
    return NextResponse.json({ error: msg + hint }, { status: 502 });
  }
}
