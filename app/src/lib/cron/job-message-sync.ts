// Job J — Page messaging (inbox) ingestion. Runs every 2h.
//
// For each active Facebook page: fetches recent Messenger conversations (with
// inlined recent messages), derives daily inbox metrics, UPSERTs into
// page_message_daily. Per-account errors are isolated — a page whose token
// lacks `pages_messaging` just logs + skips, never aborts the batch and never
// touches account status (messaging is a secondary signal).
//
// Only Facebook pages are processed — Bundle.social platforms (TikTok/IG/…)
// don't expose a Messenger conversations edge through this pipeline.

import { db } from '@/lib/db';
import { fetchPageConversations } from '@/lib/fb/api-client';
import { decryptToken } from '@/lib/fb/token-encryption';
import { toVnDateKey, vnDateKeyNow } from '@/lib/fb/tz-dates';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';
import { upsertPageMessageDaily } from '@/lib/cron/upsert-helpers';
import { callContext, type CallEntry } from '@/lib/sync/call-context';
import type { PageMessageDailyRow } from '@/lib/cron/upsert-helpers';
import type { FBConversation } from '@/lib/fb/types';

const LOOKBACK_DAYS = 7;

interface ActiveAccount {
  id: string;
  external_id: string;
  access_token_encrypted: Buffer;
}

/** Active Facebook pages with an encrypted token. */
async function loadActivePages(): Promise<ActiveAccount[]> {
  const result = await db.query<ActiveAccount>(
    `SELECT id, external_id, access_token_encrypted
     FROM social_account
     WHERE status = 'active'
       AND platform = 'facebook'
       AND access_token_encrypted IS NOT NULL`
  );
  return result.rows;
}

interface DayAgg {
  active: Set<string>;
  inbound: number;
  outbound: number;
  responded: Set<string>;
  responseMins: number[];
}

/**
 * Pure transform: conversations → daily page_message_daily rows.
 * Exported for unit testing without hitting FB or the DB.
 *
 * @param pageId  The page's external id — a message whose `from.id` equals this
 *                is OUTBOUND (page replied); anything else is INBOUND (customer).
 * @param nowMs   Current epoch ms (injected for deterministic tests).
 */
export function computeMessageRows(
  accountId: string,
  pageId: string,
  conversations: FBConversation[],
  nowMs: number
): PageMessageDailyRow[] {
  const sinceMs = nowMs - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const byDate = new Map<string, DayAgg>();
  const getDay = (key: string): DayAgg => {
    let d = byDate.get(key);
    if (!d) {
      d = { active: new Set(), inbound: 0, outbound: 0, responded: new Set(), responseMins: [] };
      byDate.set(key, d);
    }
    return d;
  };

  let unansweredNow = 0;

  for (const conv of conversations) {
    if ((conv.unread_count ?? 0) > 0) unansweredNow++;

    const msgs = (conv.messages?.data ?? [])
      .filter((m) => m.created_time)
      .sort(
        (a, b) =>
          new Date(a.created_time).getTime() - new Date(b.created_time).getTime()
      );

    let firstInboundMs: number | null = null;
    let firstResponseMs: number | null = null;

    for (const m of msgs) {
      const ts = new Date(m.created_time).getTime();
      if (Number.isNaN(ts) || ts < sinceMs) continue; // window-only

      const isOutbound = !!(m.from?.id && pageId && m.from.id === pageId);
      const day = getDay(toVnDateKey(m.created_time));
      day.active.add(conv.id);
      if (isOutbound) day.outbound++;
      else day.inbound++;

      if (!isOutbound && firstInboundMs === null) firstInboundMs = ts;
      if (
        isOutbound &&
        firstInboundMs !== null &&
        firstResponseMs === null &&
        ts >= firstInboundMs
      ) {
        firstResponseMs = ts;
      }
    }

    // Attribute the responded flag + response time to the day of the first
    // customer message (the day the clock started for the team).
    if (firstInboundMs !== null && firstResponseMs !== null) {
      const day = getDay(toVnDateKey(new Date(firstInboundMs)));
      day.responded.add(conv.id);
      day.responseMins.push((firstResponseMs - firstInboundMs) / 60000);
    }
  }

  const todayKey = vnDateKeyNow();
  const dayKeys = new Set<string>(byDate.keys());
  dayKeys.add(todayKey); // ensure today's row exists for the unanswered snapshot

  const rows: PageMessageDailyRow[] = [];
  for (const dateKey of dayKeys) {
    const d = byDate.get(dateKey);
    const mins = d?.responseMins ?? [];
    const avg =
      mins.length > 0
        ? Math.round((mins.reduce((a, b) => a + b, 0) / mins.length) * 100) / 100
        : null;
    rows.push({
      account_id: accountId,
      date: dateKey,
      active_conversations: d?.active.size ?? 0,
      inbound_messages: d?.inbound ?? 0,
      outbound_messages: d?.outbound ?? 0,
      responded_conversations: d?.responded.size ?? 0,
      unanswered_conversations: dateKey === todayKey ? unansweredNow : 0,
      avg_first_response_minutes: avg,
    });
  }
  return rows;
}

/**
 * Run the messaging ingestion job. Exported for cron/init.ts + run-job-once CLI.
 */
export async function runMessageSyncJob(): Promise<void> {
  let totalRecords = 0;

  let pages: ActiveAccount[];
  try {
    pages = await loadActivePages();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[job-message-sync] Fatal: load pages failed:', err);
    const fallbackLogId = await startSyncLog('message_sync');
    await finishSyncLog(fallbackLogId, 'failed', 0, errMsg);
    return;
  }

  console.log(`[job-message-sync] Processing ${pages.length} active FB pages`);

  for (const acc of pages) {
    const logId = await startSyncLog('message_sync', acc.id);
    const calls: CallEntry[] = [];
    try {
      const upserted = await callContext.run(calls, async () => {
        const token = await decryptToken(acc.access_token_encrypted);
        const nowMs = Date.now();
        const sinceMs = nowMs - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
        const conversations = await fetchPageConversations(
          token,
          acc.external_id,
          sinceMs
        );
        const rows = computeMessageRows(acc.id, acc.external_id, conversations, nowMs);
        return upsertPageMessageDaily(rows);
      });
      totalRecords += upserted;
      await finishSyncLog(logId, 'success', upserted, null, calls);
      console.log(`[job-message-sync] Page ${acc.id}: upserted ${upserted} rows`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Do NOT call handleAccountError — a missing pages_messaging scope must
      // not flip the page to token_expired/disconnected. Just log + move on.
      await finishSyncLog(logId, 'failed', 0, errMsg, calls);
      console.warn(`[job-message-sync] Page ${acc.id} skipped: ${errMsg.slice(0, 160)}`);
    }
  }

  console.log(`[job-message-sync] Done — ${totalRecords} rows upserted`);
}
