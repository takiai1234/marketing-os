// PUT  /api/settings/apify — save news ingestion settings (Apify + fb-cli)
// POST /api/settings/apify — sync ngay (manual trigger cron)
// DELETE /api/settings/apify — clear all settings
//
// Settings keys lưu (encrypted) trong app_setting:
//   - APIFY_API_TOKEN        (chỉ cần cho Twitter — Facebook chạy fb-cli free)
//   - APIFY_TWITTER_HANDLES  (csv: "sama,rubenhassid,...")
//   - APIFY_FACEBOOK_PAGES   (csv: "huanyoutube,nghecontent,..." hoặc full URL)
//   - APIFY_TWITTER_ACTOR    (optional override, default apidojo/twitter-scraper-lite)
//   - APIFY_FACEBOOK_ACTOR   (legacy — không dùng nữa, FB đi qua fb-cli)
//   - FB_SESSION_C_USER      (optional cookie → fb-cli tier 1: full timeline)
//   - FB_SESSION_XS          (optional cookie, đi cùng c_user)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { setSetting, deleteSetting } from '@/lib/settings/api-keys';
import { runApifyNewsJob } from '@/lib/cron/job-apify-news';

export const runtime = 'nodejs';

const KEYS = {
  TOKEN: 'APIFY_API_TOKEN',
  TWITTER_HANDLES: 'APIFY_TWITTER_HANDLES',
  FACEBOOK_PAGES: 'APIFY_FACEBOOK_PAGES',
  TWITTER_ACTOR: 'APIFY_TWITTER_ACTOR',
  FACEBOOK_ACTOR: 'APIFY_FACEBOOK_ACTOR',
  FB_C_USER: 'FB_SESSION_C_USER',
  FB_XS: 'FB_SESSION_XS',
} as const;

const putBodySchema = z.object({
  apiToken: z.string().trim().min(8).max(200).optional(),
  twitterHandles: z.string().trim().max(5000).optional(),
  facebookPages: z.string().trim().max(5000).optional(),
  twitterActor: z.string().trim().max(100).optional(),
  facebookActor: z.string().trim().max(100).optional(),
  // fb-cli session cookies (tier 1). Gửi cả 2 cùng lúc mới có tác dụng.
  fbCUser: z.string().trim().min(3).max(50).optional(),
  fbXs: z.string().trim().min(8).max(500).optional(),
});

async function requireAdmin(): Promise<NextResponse | { userId: string }> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = await getUserRole(user.userId);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  return { userId: user.userId };
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  // Mỗi field optional → chỉ save field nào user gửi (cho phép update từng phần).
  // Empty string → KHÔNG xóa (dùng DELETE cho việc xóa). Bỏ qua.
  const updates: Array<Promise<void>> = [];
  if (parsed.data.apiToken) {
    updates.push(
      setSetting(KEYS.TOKEN, parsed.data.apiToken, auth.userId, 'Apify API token')
    );
  }
  if (parsed.data.twitterHandles !== undefined) {
    updates.push(
      setSetting(
        KEYS.TWITTER_HANDLES,
        parsed.data.twitterHandles,
        auth.userId,
        'CSV list Twitter handles cần pull (vd "sama,rubenhassid")'
      )
    );
  }
  if (parsed.data.facebookPages !== undefined) {
    updates.push(
      setSetting(
        KEYS.FACEBOOK_PAGES,
        parsed.data.facebookPages,
        auth.userId,
        'CSV list FB page slugs hoặc URLs cần pull'
      )
    );
  }
  if (parsed.data.twitterActor) {
    updates.push(setSetting(KEYS.TWITTER_ACTOR, parsed.data.twitterActor, auth.userId));
  }
  if (parsed.data.facebookActor) {
    updates.push(setSetting(KEYS.FACEBOOK_ACTOR, parsed.data.facebookActor, auth.userId));
  }
  if (parsed.data.fbCUser) {
    updates.push(
      setSetting(KEYS.FB_C_USER, parsed.data.fbCUser, auth.userId, 'fb-cli cookie c_user (tier 1)')
    );
  }
  if (parsed.data.fbXs) {
    updates.push(
      setSetting(KEYS.FB_XS, parsed.data.fbXs, auth.userId, 'fb-cli cookie xs (tier 1)')
    );
  }

  await Promise.all(updates);

  return NextResponse.json({ ok: true });
}

/** POST trigger sync ngay (không đợi cron 6h). Long-running — return job result. */
export async function POST(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await runApifyNewsJob();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  await Promise.all([
    deleteSetting(KEYS.TOKEN),
    deleteSetting(KEYS.TWITTER_HANDLES),
    deleteSetting(KEYS.FACEBOOK_PAGES),
    deleteSetting(KEYS.TWITTER_ACTOR),
    deleteSetting(KEYS.FACEBOOK_ACTOR),
    deleteSetting(KEYS.FB_C_USER),
    deleteSetting(KEYS.FB_XS),
  ]);

  return NextResponse.json({ ok: true });
}
