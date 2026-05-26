// Database helpers for social_connect_session — the pending OAuth handshake
// rows we create in initiate and resolve in finalize.

import { db } from '@/lib/db';
import type { PlatformKey } from '@/lib/platforms/registry';

export interface ConnectSessionRow {
  id: string;
  state_token: string;
  owner_member_id: string;
  platform: PlatformKey;
  bundle_team_id: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  error_message: string | null;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
}

/**
 * Insert a new pending connect session.
 *
 * `expiresAt` is computed in Node (caller side) rather than via PG `NOW() + interval`
 * to avoid clock skew between the DB host and the app host (common with Docker on
 * Windows where Hyper-V time sync drifts by minutes). Storing an absolute timestamp
 * keeps the UI countdown honest regardless of where Postgres runs.
 */
export async function insertConnectSession(input: {
  stateToken: string;
  ownerMemberId: string;
  platform: PlatformKey;
  bundleTeamId: string;
  expiresAt: Date;
}): Promise<ConnectSessionRow> {
  const { rows } = await db.query<ConnectSessionRow>(
    `INSERT INTO social_connect_session
       (state_token, owner_member_id, platform, bundle_team_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.stateToken,
      input.ownerMemberId,
      input.platform,
      input.bundleTeamId,
      input.expiresAt.toISOString(),
    ]
  );
  // INSERT ... RETURNING * always produces exactly one row when no error thrown
  const inserted = rows[0];
  if (!inserted) throw new Error('createConnectSession: INSERT returned no row');
  return inserted;
}

export async function findConnectSessionByToken(
  stateToken: string
): Promise<ConnectSessionRow | null> {
  const { rows } = await db.query<ConnectSessionRow>(
    `SELECT * FROM social_connect_session WHERE state_token = $1 LIMIT 1`,
    [stateToken]
  );
  return rows[0] ?? null;
}

/** Count pending sessions a member started in the last N minutes — for rate-limit. */
export async function countRecentSessionsByMember(
  ownerMemberId: string,
  withinMinutes: number
): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM social_connect_session
      WHERE owner_member_id = $1
        AND created_at >= NOW() - ($2 || ' minutes')::interval`,
    [ownerMemberId, String(withinMinutes)]
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

export async function markConnectSessionCompleted(id: string): Promise<void> {
  // Also accept `failed` rows — they can recover after a bugfix retry.
  await db.query(
    `UPDATE social_connect_session
        SET status = 'completed', completed_at = NOW(), error_message = NULL
      WHERE id = $1 AND status IN ('pending', 'failed')`,
    [id]
  );
}

export async function markConnectSessionFailed(id: string, reason: string): Promise<void> {
  await db.query(
    `UPDATE social_connect_session
        SET status = 'failed', error_message = $2, completed_at = NOW()
      WHERE id = $1 AND status = 'pending'`,
    [id, reason]
  );
}

export async function markConnectSessionExpired(id: string): Promise<void> {
  await db.query(
    `UPDATE social_connect_session
        SET status = 'expired', completed_at = NOW()
      WHERE id = $1 AND status = 'pending'`,
    [id]
  );
}

export async function countPendingSessionsForMember(ownerMemberId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM social_connect_session
      WHERE owner_member_id = $1
        AND status = 'pending'
        AND expires_at > NOW()`,
    [ownerMemberId]
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}
