// POST /api/settings/integrations/anthropic/test
//
// Verify key đang được store work bằng cách gọi Anthropic API /messages
// với 1 prompt nhỏ ("ping"). Trả tier/cost info nếu OK, error message
// nếu sai key/expired/rate limited.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { getAnthropic, AVAILABLE_MODELS } from '@/lib/anthropic/client';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let anthropic;
  try {
    anthropic = await getAnthropic();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Test với model rẻ nhất, max_tokens=10 → cost ~$0.0001 / lần test
  const cheapModel = AVAILABLE_MODELS[0].id;

  try {
    const response = await anthropic.messages.create({
      model: cheapModel,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }],
    });

    return NextResponse.json({
      ok: true,
      model: response.model,
      usage: {
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      },
      stopReason: response.stop_reason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Anthropic API error';
    // Common errors mapping cho UX friendly:
    let hint = '';
    if (msg.includes('authentication') || msg.includes('401')) {
      hint = ' (Key sai hoặc đã revoke — paste lại)';
    } else if (msg.includes('rate_limit') || msg.includes('429')) {
      hint = ' (Đã hit rate limit — đợi vài phút)';
    } else if (msg.includes('credit') || msg.includes('billing')) {
      hint = ' (Account chưa add credit — vào console.anthropic.com → Billing)';
    }
    return NextResponse.json({ error: msg + hint }, { status: 502 });
  }
}
