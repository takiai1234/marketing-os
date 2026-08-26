// GET /api/channels/publishable — danh sách kênh đủ điều kiện đăng bài từ brief.
// Phase 1: chỉ Facebook Page active có token. Dùng cho dialog "Đăng lên kênh".

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { listPublishableChannels } from '@/lib/queries/brief-publications';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const channels = await listPublishableChannels();
    return NextResponse.json({ channels });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[GET /api/channels/publishable]', message, err);
    return NextResponse.json(
      { error: `Failed to load channels: ${message}` },
      { status: 500 }
    );
  }
}
