import { NextResponse } from 'next/server';
import { getUserRole } from './get-role';
import { isGuest } from './roles';

/**
 * Chặn role `guest` ở tầng route handler.
 *
 * Bình thường proxy (src/proxy.ts) đã chặn mọi request ghi của guest, nên helper
 * này CHỈ cần cho các đường dẫn bị `config.matcher` của proxy loại trừ —
 * hiện là `/api/auth/change-password` và `/api/skills/upload`.
 *
 * Trả `null` nếu được phép đi tiếp, hoặc một NextResponse 403 nếu bị chặn.
 */
export async function rejectGuest(userId: string): Promise<NextResponse | null> {
  const role = await getUserRole(userId);
  if (!isGuest(role)) return null;
  return NextResponse.json(
    { error: 'Tài khoản Khách chỉ có quyền xem, không được chỉnh sửa.' },
    { status: 403 }
  );
}
