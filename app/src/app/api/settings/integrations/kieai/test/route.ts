// POST /api/settings/integrations/kieai/test
//
// Validate kie.ai API key WITHOUT spending credits.
// Strategy: gọi GET /jobs/recordInfo với 1 taskId fake. kie.ai phản hồi:
//   - 401/403 → key sai (test FAIL)
//   - 200 + code khác 200 (task not found) → key OK (test PASS)
//   - 200 + code 200 + data null → key OK (test PASS)
// Tránh /jobs/createTask vì nó tốn credit thật.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import { KIE_AI_KEY_NAME } from '@/lib/llm/kie-ai';

export const runtime = 'nodejs';

const BASE_URL = process.env.KIE_AI_BASE_URL ?? 'https://api.kie.ai/api/v1';

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const key = await getSettingOrEnv(KIE_AI_KEY_NAME);
  if (!key) {
    return NextResponse.json(
      { error: 'KIE_AI_API_KEY chưa cấu hình — set bằng PUT trước' },
      { status: 400 }
    );
  }

  // Fake taskId — UUID-shaped để qua server-side validation nếu có
  const fakeTaskId = '00000000-0000-0000-0000-000000000000';
  const url = `${BASE_URL}/jobs/recordInfo?taskId=${fakeTaskId}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json(
        { error: `kie.ai từ chối key (HTTP ${res.status}) — paste lại từ kie.ai dashboard` },
        { status: 502 }
      );
    }

    // 200 với code khác 200 (vd 404 task not found) → key OK
    // 5xx → kie.ai đang lỗi, không phải lỗi key
    const body = (await res.json().catch(() => ({}))) as {
      code?: number;
      msg?: string;
      message?: string;
    };

    if (res.status >= 500) {
      return NextResponse.json(
        {
          error: `kie.ai server lỗi (HTTP ${res.status}): ${body.msg ?? body.message ?? '?'}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      baseUrl: BASE_URL,
      httpStatus: res.status,
      apiCode: body.code ?? null,
      apiMsg: body.msg ?? body.message ?? null,
      note: 'Key xác thực OK. Task-not-found là phản hồi mong đợi.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return NextResponse.json(
      { error: `Không gọi được kie.ai: ${msg}` },
      { status: 502 }
    );
  }
}
