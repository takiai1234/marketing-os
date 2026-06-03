// GET /api/settings/integrations — list metadata của tất cả integration keys
// Admin-only. Trả masked status (chưa set / đã set + updatedBy + updatedAt).
// KHÔNG return plaintext.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { listSettingsMetadata } from '@/lib/settings/api-keys';
import { OPENROUTER_KEY_NAME } from '@/lib/llm/openrouter';
import { KIE_AI_KEY_NAME } from '@/lib/llm/kie-ai';
import { FB_APP_ID_KEY, FB_APP_SECRET_KEY } from '@/lib/fb/oauth-flow';

export const runtime = 'nodejs';

// List các key managed qua UI — extend khi add provider mới
const MANAGED_KEYS = [
  OPENROUTER_KEY_NAME,
  KIE_AI_KEY_NAME,
  FB_APP_ID_KEY,
  FB_APP_SECRET_KEY,
] as const;

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const metadata = await listSettingsMetadata([...MANAGED_KEYS]);

  // Bổ sung info: env var fallback có tồn tại không (để UI hiển thị
  // "đang dùng env" vs "đang dùng DB").
  const enriched = metadata.map((m) => ({
    ...m,
    hasEnvFallback: Boolean(process.env[m.key]),
  }));

  return NextResponse.json({ integrations: enriched });
}
