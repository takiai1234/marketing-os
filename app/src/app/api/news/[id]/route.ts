// DELETE /api/news/[id] — ẩn 1 bài khỏi danh sách Tin tức (soft-hide).
//
// Dùng soft-hide (cờ hidden=true) thay vì DELETE cứng để lần quét/cron sau
// không thêm lại bài (xem migration 044). Auth: user đăng nhập.

import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getCurrentUser } from '@/lib/auth/get-session';
import { hideNewsArticle } from '@/lib/news/news-db';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(
  _req: Request,
  context: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const hidden = await hideNewsArticle(id);
    revalidateTag('news', 'max');
    return NextResponse.json({ ok: true, hidden });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[DELETE /api/news/:id]', msg);
    return NextResponse.json({ error: 'Failed to hide article' }, { status: 500 });
  }
}
