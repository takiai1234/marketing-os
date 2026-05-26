// Finalize a Bundle.social OAuth handshake.
//
// Called from /channels page when ?bundle_session= shows up in the URL.
// Resolves the pending session row, fetches the now-connected social account
// from Bundle, and UPSERTs our local social_account so the channel appears
// in the list.
//
// Idempotent: re-running on a 'completed' session returns the existing channel.
// Retries: Bundle may take a few seconds after OAuth completes for the account
// to be visible via /social-account/by-type — we retry up to 3 times.

import { db } from '@/lib/db';
import { getBundleSocialAccountByType } from './api-client';
import { BundleError } from './types';
import {
  findConnectSessionByToken,
  markConnectSessionCompleted,
  markConnectSessionExpired,
  markConnectSessionFailed,
  type ConnectSessionRow,
} from './connect-session';
import { requirePlatform } from '@/lib/platforms/registry';

export type FinalizeOutcome =
  | { ok: true; channelId: string; platform: string; alreadyCompleted: boolean }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'expired' | 'not_connected_yet' | 'bundle_error'; message: string };

interface FinalizeInput {
  stateToken: string;
  /**
   * team_member.id from the current iron-session if the browser hitting
   * the callback is authenticated. Optional: cross-device flow lets a
   * different browser (eg. phone) complete OAuth — there the state token
   * itself is the security boundary, and we trust the owner stored on
   * the session row.
   */
  currentUserId?: string | null;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function finalizeBundleSession(input: FinalizeInput): Promise<FinalizeOutcome> {
  const session = await findConnectSessionByToken(input.stateToken);
  if (!session) {
    return { ok: false, reason: 'not_found', message: 'Session không tồn tại.' };
  }
  // Cross-device support: only enforce the owner-match check when a
  // currentUserId was passed AND it disagrees with the session. An empty
  // current user (anonymous browser hitting the callback) is allowed
  // through — the random 64-char state_token is the boundary.
  if (input.currentUserId && session.owner_member_id !== input.currentUserId) {
    return { ok: false, reason: 'forbidden', message: 'Session thuộc user khác.' };
  }

  // Idempotent: if already completed, return existing channel row.
  if (session.status === 'completed') {
    const channel = await findChannelByBundleTeamId(session.bundle_team_id);
    if (channel) {
      return {
        ok: true,
        channelId: channel.id,
        platform: session.platform,
        alreadyCompleted: true,
      };
    }
    // Marked completed but no row — rare; recovery path = redo upsert below
  }

  if (session.status === 'expired' || new Date(session.expires_at) < new Date()) {
    await markConnectSessionExpired(session.id);
    return { ok: false, reason: 'expired', message: 'Session đã hết hạn (>10 phút).' };
  }

  // `failed` is recoverable as long as the session hasn't expired — letting
  // it retry means a bugfix (like the missing-externalId case) gets a second
  // chance without forcing the user to start a brand-new OAuth.

  const platform = requirePlatform(session.platform);
  const bundleAccount = await fetchWithRetry(platform.bundleType, session.bundle_team_id);

  if (!bundleAccount) {
    // Don't mark as failed — user may complete OAuth shortly. Just report not-yet.
    return {
      ok: false,
      reason: 'not_connected_yet',
      message: 'Bundle chưa thấy tài khoản. Hoàn tất OAuth rồi quay lại trang này.',
    };
  }

  // Different Bundle platforms expose the platform-native identifier in
  // different fields. For TikTok/Threads/Reddit/Mastodon/Bluesky the
  // identifier lives on the account itself (`externalId`). For platforms
  // where one Bundle account owns multiple sub-pages (YouTube channels,
  // Facebook pages, IG profiles) the identifier sits in `channels[0].id`.
  // Picking the first channel keeps the flow single-step; multi-channel
  // selection can come later as a follow-up screen.
  const primaryChannel = bundleAccount.channels?.[0];
  const externalId = bundleAccount.externalId ?? primaryChannel?.id ?? null;

  if (!externalId) {
    await markConnectSessionFailed(session.id, 'bundle_account_missing_external_id');
    return {
      ok: false,
      reason: 'bundle_error',
      message: 'Bundle không trả về externalId lẫn channel id — có thể OAuth chưa hoàn tất.',
    };
  }

  const displayName =
    bundleAccount.displayName
    ?? primaryChannel?.name
    ?? bundleAccount.username
    ?? primaryChannel?.username
    ?? platform.label;
  const username = bundleAccount.username ?? primaryChannel?.username ?? null;
  const avatarUrl = bundleAccount.avatarUrl ?? primaryChannel?.avatarUrl ?? null;

  const channelId = await upsertSocialAccountFromBundle({
    platform: session.platform,
    externalId,
    name: displayName,
    bundleTeamId: session.bundle_team_id,
    bundleSocialAccountId: bundleAccount.id,
    bundleUsername: username,
    bundleAvatarUrl: avatarUrl,
    ownerMemberId: session.owner_member_id,
  });

  await markConnectSessionCompleted(session.id);

  return { ok: true, channelId, platform: session.platform, alreadyCompleted: false };
}

async function fetchWithRetry(bundleType: string, teamId: string) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await getBundleSocialAccountByType({ type: bundleType, teamId });
      if (result) return result;
    } catch (err) {
      if (err instanceof BundleError && err.httpStatus === 404) {
        // Account not yet visible — fall through to retry
      } else {
        throw err;
      }
    }
    if (attempt < MAX_RETRIES - 1) await sleep(RETRY_DELAY_MS);
  }
  return null;
}

interface UpsertInput {
  platform: ConnectSessionRow['platform'];
  externalId: string;
  name: string;
  bundleTeamId: string;
  bundleSocialAccountId: string;
  bundleUsername: string | null;
  bundleAvatarUrl: string | null;
  ownerMemberId: string;
}

async function upsertSocialAccountFromBundle(input: UpsertInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO social_account (
       platform, external_id, name,
       bundle_team_id, bundle_social_account_id, bundle_username, bundle_avatar_url,
       status, owner_member_id, kpi_posts_per_day
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, 1)
     ON CONFLICT (platform, external_id) DO UPDATE SET
       name                      = EXCLUDED.name,
       bundle_team_id            = EXCLUDED.bundle_team_id,
       bundle_social_account_id  = EXCLUDED.bundle_social_account_id,
       bundle_username           = EXCLUDED.bundle_username,
       bundle_avatar_url         = EXCLUDED.bundle_avatar_url,
       status                    = 'active',
       owner_member_id           = COALESCE(social_account.owner_member_id, EXCLUDED.owner_member_id),
       connected_at              = NOW()
     RETURNING id`,
    [
      input.platform,
      input.externalId,
      input.name,
      input.bundleTeamId,
      input.bundleSocialAccountId,
      input.bundleUsername,
      input.bundleAvatarUrl,
      input.ownerMemberId,
    ]
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('UPSERT social_account returned no id');
  return id;
}

async function findChannelByBundleTeamId(bundleTeamId: string): Promise<{ id: string } | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM social_account WHERE bundle_team_id = $1 LIMIT 1`,
    [bundleTeamId]
  );
  return rows[0] ?? null;
}
