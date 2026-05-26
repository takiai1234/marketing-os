// POST /api/channels/bundle/initiate
// Body: { platform: 'tiktok' | 'instagram' | ... (non-FB, import-supported) }
//
// Creates a fresh Bundle.social team (1 team per channel for max isolation),
// records a pending social_connect_session with a CSRF state token, then asks
// Bundle for an OAuth URL the user can open / copy.
//
// The state token also flows back via Bundle's `redirectUrl` query param so the
// finalize route knows which session this redirect belongs to.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  createBundleTeam,
  connectBundleSocialAccount,
} from '@/lib/bundle/api-client';
import { BundleError } from '@/lib/bundle/types';
import {
  insertConnectSession,
  countRecentSessionsByMember,
} from '@/lib/bundle/connect-session';
import { requirePlatform, type PlatformKey } from '@/lib/platforms/registry';

export const runtime = 'nodejs';

const RATE_LIMIT_WINDOW_MIN = 10;
const RATE_LIMIT_MAX = 5;
// 1 hour — matches what Bundle's OAuth connect URL realistically tolerates.
// User can leave the panel open while signing into TikTok/IG on another device.
const SESSION_TTL_SECONDS = 3600;

const initiateSchema = z.object({
  platform: z.enum([
    'tiktok', 'youtube', 'instagram', 'threads',
    'linkedin', 'pinterest', 'reddit', 'mastodon', 'bluesky',
  ] as const satisfies readonly PlatformKey[]),
});

function publicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    'http://localhost:3000'
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = initiateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid platform', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const platform = requirePlatform(parsed.data.platform);

  // Defensive: registry should already exclude non-importable; double-check
  // so a stale client cannot bypass the disabled tile.
  if (platform.flow !== 'bundle' || !platform.importSupported) {
    return NextResponse.json(
      { error: 'Platform không hỗ trợ kết nối qua Bundle.' },
      { status: 400 }
    );
  }

  const recent = await countRecentSessionsByMember(user.userId, RATE_LIMIT_WINDOW_MIN);
  if (recent >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      {
        error: `Quá nhiều lần khởi tạo trong ${RATE_LIMIT_WINDOW_MIN} phút (>${RATE_LIMIT_MAX}). Vui lòng thử lại sau.`,
      },
      { status: 429 }
    );
  }

  // Bundle team name constraint: 3-80 chars. Compose from member + platform + ts
  // for easy identification in Bundle dashboard ("debug who created this team").
  const stamp = Date.now().toString(36);
  const teamName = `taki-${user.userId.slice(0, 8)}-${platform.key}-${stamp}`.slice(0, 80);

  let bundleTeamId: string;
  try {
    const team = await createBundleTeam({ name: teamName });
    bundleTeamId = team.id;
  } catch (err) {
    const message = err instanceof BundleError ? err.message : String(err);
    console.error('[bundle/initiate] createBundleTeam failed:', message);
    return NextResponse.json(
      { error: `Bundle team creation failed: ${message}` },
      { status: 502 }
    );
  }

  const stateToken = randomBytes(32).toString('hex');
  // Compute expiry on the Node side (not via PG NOW() + interval) so the
  // returned timestamp aligns with the client's clock — avoids the off-by-N
  // minutes the user would see if the DB container drifts away from the host.
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await insertConnectSession({
    stateToken,
    ownerMemberId: user.userId,
    platform: platform.key,
    bundleTeamId,
    expiresAt,
  });

  // Public callback route (outside auth gate) so cross-device flows work:
  // user copies OAuth URL → completes on another device → Bundle redirects
  // that device here → finalize using state token (no login required on the
  // second device).
  const redirectUrl = `${publicBaseUrl()}/bundle/callback?session=${stateToken}`;

  let connectUrl: string;
  try {
    const result = await connectBundleSocialAccount({
      type: platform.bundleType,
      teamId: bundleTeamId,
      redirectUrl,
    });
    connectUrl = result.url;
  } catch (err) {
    const message = err instanceof BundleError ? err.message : String(err);
    console.error('[bundle/initiate] connect failed:', message);
    return NextResponse.json(
      { error: `Bundle connect failed: ${message}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    connectUrl,
    sessionId: session.id,
    expiresAt: session.expires_at,
    platform: platform.key,
  });
}
