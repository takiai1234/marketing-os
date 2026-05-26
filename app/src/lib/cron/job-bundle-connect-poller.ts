// Job H — Bundle connect-session poller.
//
// Background safety net for cross-device OAuth: user clicks "Tạo link" on
// Machine A, copies the OAuth URL to Machine B (phone/another browser),
// completes OAuth there. Bundle's redirect lands on Machine B → that browser
// is anonymous in our app → the redirect-based callback can't sync state to
// Machine A.
//
// Solution: poll Bundle ourselves. Every 2 min we walk through pending
// social_connect_session rows and ask Bundle "has an account of platform X
// appeared under team Y yet?". When it does, we finalize the same way the
// redirect callback would — UPSERT social_account, mark session completed.
//
// Lifecycle:
//   t=0       initiate creates session (status='pending', expires_at = NOW+1h)
//   t=0..1h   poller checks every 2 min
//             - account present  → finalize, status='completed' (poller stops)
//             - account absent   → leave pending (poller retries)
//   t>1h      session auto-expires (poller marks status='expired')

import { db } from '@/lib/db';
import { finalizeBundleSession } from '@/lib/bundle/finalize';
import {
  markConnectSessionExpired,
  type ConnectSessionRow,
} from '@/lib/bundle/connect-session';

export interface ConnectPollerReport {
  scanned: number;
  completed: number;
  stillPending: number;
  expired: number;
  errored: number;
}

export async function runBundleConnectPollerJob(): Promise<ConnectPollerReport> {
  const { rows: pending } = await db.query<ConnectSessionRow>(
    `SELECT *
       FROM social_connect_session
      WHERE status = 'pending'
      ORDER BY created_at ASC`
  );

  const report: ConnectPollerReport = {
    scanned: pending.length, completed: 0, stillPending: 0, expired: 0, errored: 0,
  };
  if (pending.length === 0) return report;

  console.log(`[cron/connect-poller] scanning ${pending.length} pending session(s)`);

  for (const session of pending) {
    // Expire rows past their TTL first — saves a Bundle API call.
    if (new Date(session.expires_at) < new Date()) {
      await markConnectSessionExpired(session.id);
      report.expired++;
      console.log(`[cron/connect-poller] ${session.id}: expired (>1h since initiate)`);
      continue;
    }

    try {
      const outcome = await finalizeBundleSession({
        stateToken: session.state_token,
        currentUserId: null, // cron has no user context; token is the boundary
      });

      if (outcome.ok) {
        report.completed++;
        console.log(
          `[cron/connect-poller] ${session.id}: finalized ${session.platform} channel ${outcome.channelId}`
        );
      } else if (outcome.reason === 'not_connected_yet') {
        // Normal — OAuth still in flight on user's device. Try again next tick.
        report.stillPending++;
      } else {
        // 'forbidden' can't happen with currentUserId=null. 'expired' / 'not_found'
        // are terminal — finalize already cleaned up. 'bundle_error' is data shape
        // issue (logged inside finalize). Don't retry hard failures.
        report.errored++;
        console.warn(
          `[cron/connect-poller] ${session.id}: terminal failure — ${outcome.reason}: ${outcome.message}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/connect-poller] ${session.id}: unexpected — ${msg}`);
      report.errored++;
    }
  }

  console.log(
    `[cron/connect-poller] done — completed=${report.completed} ` +
      `still_pending=${report.stillPending} expired=${report.expired} errored=${report.errored}`
  );
  return report;
}
