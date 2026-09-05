// GET /api/admin/apify-debug?type=twitter|facebook
//
// Admin-only debug endpoint: trả về RAW items (5 items đầu) chưa qua mapper
// → debug field names khi mapper return 0.
//
//   twitter  → Apify sync API (cần APIFY_API_TOKEN)
//   facebook → fb-cli binary (không cần token)

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { getSettingOrEnv } from '@/lib/settings/api-keys';
import {
  runActorSync,
  buildTwitterInput,
  parseList,
  DEFAULT_TWITTER_ACTOR,
} from '@/lib/news/apify-sync';
import { normalizePageRef, fetchFbPagePosts } from '@/lib/news/fb-cli';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole(user.userId);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const url = new URL(req.url);
  const type = url.searchParams.get('type');

  if (type !== 'twitter' && type !== 'facebook') {
    return NextResponse.json(
      { error: 'Need ?type=twitter or ?type=facebook' },
      { status: 400 }
    );
  }

  try {
    const rawList = await getSettingOrEnv(
      type === 'twitter' ? 'APIFY_TWITTER_HANDLES' : 'APIFY_FACEBOOK_PAGES'
    );
    const list = rawList ? parseList(rawList) : [];
    if (list.length === 0) {
      return NextResponse.json({ error: `Chưa config list ${type}` }, { status: 400 });
    }

    if (type === 'facebook') {
      // fb-cli — chỉ đọc page đầu tiên trong list cho nhanh
      const pageRef = normalizePageRef(list[0] ?? '');
      const items = await fetchFbPagePosts(pageRef, 5);
      return NextResponse.json({
        ok: true,
        engine: 'fb-cli',
        pageRef,
        itemCount: items.length,
        sampleItems: items.slice(0, 5),
        sampleKeys: items.length > 0 ? Object.keys(items[0] ?? {}) : [],
      });
    }

    const customActor = await getSettingOrEnv('APIFY_TWITTER_ACTOR');
    const actor = customActor || DEFAULT_TWITTER_ACTOR;
    const input = buildTwitterInput(list);
    const items = await runActorSync(actor, input);

    return NextResponse.json({
      ok: true,
      engine: 'apify',
      actor,
      inputSent: input,
      itemCount: items.length,
      // 5 items đầu — đủ để xem shape, không quá dài
      sampleItems: items.slice(0, 5),
      // Field names ở top-level — quick scan
      sampleKeys: items.length > 0 ? Object.keys(items[0] ?? {}) : [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
