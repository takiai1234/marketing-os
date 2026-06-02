// POST /api/settings/integrations/openrouter/test
// Verify key bằng cách gọi OpenRouter với model rẻ nhất + max_tokens=10.

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

  // Pick model RẺ NHẤT trong list để test (gemini flash hoặc gpt-4o-mini)
  // Hardcode 'google/gemini-2.5-flash' — ~$0.0001 / lần test 10 token.
  // Fallback first model nếu list thay đổi.
  const testModel =
    AVAILABLE_MODELS.find((m) => m.id === 'google/gemini-2.5-flash')?.id ??
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
    const msg = err instanceof Error ? err.message : 'OpenRouter API error';
    let hint = '';
    if (msg.includes('401') || msg.includes('Invalid API key')) {
      hint = ' (Key sai/revoke — paste lại từ openrouter.ai/keys)';
    } else if (msg.includes('429') || msg.includes('rate')) {
      hint = ' (Hit rate limit — đợi vài phút)';
    } else if (msg.includes('insufficient') || msg.includes('credit')) {
      hint = ' (Account hết credit — vào openrouter.ai/credits add tiền)';
    }
    return NextResponse.json({ error: msg + hint }, { status: 502 });
  }
}
