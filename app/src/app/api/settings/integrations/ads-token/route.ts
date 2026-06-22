// Quản lý ADS_INGEST_TOKEN qua UI admin (khỏi sửa .env / SSH).
//
//   POST   — sinh token ngẫu nhiên mới, lưu (encrypted), trả về giá trị để copy.
//   PUT    — lưu token admin tự nhập.
//   GET    — tiết lộ token hiện tại (admin-only) để copy lại vào extension.
//   DELETE — xoá token (extension sẽ bị từ chối cho tới khi set lại).
//
// Token này là "khoá" cho endpoint /api/news/ingest-ads (extension dùng để
// đẩy ad FB Ads Library về). Khác các key khác: GET CÓ tiết lộ giá trị vì mục
// đích của nó là để admin copy sang extension — vẫn gated admin-only.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import {
  setSetting,
  deleteSetting,
  getSettingOrEnv,
} from '@/lib/settings/api-keys';

export const runtime = 'nodejs';

const KEY_NAME = 'ADS_INGEST_TOKEN';
const DESCRIPTION = 'Bearer token cho /api/news/ingest-ads — Chrome extension quét FB Ads.';

const putSchema = z.object({
  token: z
    .string()
    .trim()
    .min(16, 'Token quá ngắn (tối thiểu 16 ký tự)')
    .max(200, 'Token quá dài'),
});

/** Chặn non-admin. Trả về userId nếu hợp lệ, else NextResponse lỗi. */
async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  return { userId: user.userId };
}

/** GET — tiết lộ token hiện tại (để copy lại). */
export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const token = await getSettingOrEnv(KEY_NAME);
  return NextResponse.json({ token: token ?? null });
}

/** POST — sinh token ngẫu nhiên mới + lưu + trả về để copy. */
export async function POST(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const token = randomBytes(24).toString('hex'); // 48 ký tự hex
  await setSetting(KEY_NAME, token, auth.userId, DESCRIPTION);

  return NextResponse.json({ ok: true, token });
}

/** PUT — admin tự nhập token. */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validation failed' },
      { status: 400 }
    );
  }

  await setSetting(KEY_NAME, parsed.data.token, auth.userId, DESCRIPTION);
  return NextResponse.json({ ok: true, token: parsed.data.token });
}

/** DELETE — xoá token. */
export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const removed = await deleteSetting(KEY_NAME);
  return NextResponse.json({ ok: true, removed });
}
