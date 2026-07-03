// Job E — GA4 sessions sync (chạy daily 00:30 Asia/Ho_Chi_Minh).
// Với mỗi landing_page active: fetch sessions 30 ngày gần nhất từ GA4 Data API
// rồi upsert vào landing_page_daily.

import { db } from '@/lib/db';
import { fetchGa4Sessions } from '@/lib/google/ga4-client';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';

interface LandingPageRow {
  id: string;
  name: string;
  page_path: string;
  ga4_property_id: string;
}

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runGa4SyncJob(): Promise<void> {
  const logId = await startSyncLog('ga4_sync');
  let totalUpserted = 0;

  try {
    const { rows: pages } = await db.query<LandingPageRow>(
      `SELECT id, name, page_path, ga4_property_id
         FROM landing_page
        WHERE is_active = TRUE`
    );

    if (pages.length === 0) {
      await finishSyncLog(logId, 'success', 0, 'Không có landing page nào active');
      return;
    }

    const startDate = nDaysAgo(30);
    const endDate = today();

    // Group pages by property để giảm số lần gọi API
    const byProperty = new Map<string, LandingPageRow[]>();
    for (const p of pages) {
      const arr = byProperty.get(p.ga4_property_id) ?? [];
      arr.push(p);
      byProperty.set(p.ga4_property_id, arr);
    }

    const errors: string[] = [];

    for (const [propertyId, propertyPages] of byProperty) {
      let rows;
      try {
        rows = await fetchGa4Sessions(propertyId, startDate, endDate);
        console.log(`[job-ga4] property=${propertyId} → ${rows.length} rows`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[job-ga4] property=${propertyId} fetch failed:`, msg);
        errors.push(`property ${propertyId}: ${msg}`);
        continue;
      }

      // Build lookup: pagePath → sessions per date
      const lookup = new Map<string, number>();
      for (const r of rows) {
        lookup.set(`${r.pagePath}__${r.date}`, r.sessions);
      }

      for (const page of propertyPages) {
        // Lấy tất cả dates trong range, upsert từng ngày
        const pageRows = rows.filter((r) => r.pagePath === page.page_path);
        if (pageRows.length === 0) continue;

        for (const r of pageRows) {
          await db.query(
            `INSERT INTO landing_page_daily (landing_page_id, date, sessions, updated_at)
             VALUES ($1, $2::date, $3, NOW())
             ON CONFLICT (landing_page_id, date) DO UPDATE
               SET sessions = EXCLUDED.sessions,
                   updated_at = NOW()`,
            [page.id, r.date, r.sessions]
          );
          totalUpserted++;
        }
      }
    }

    if (errors.length > 0 && totalUpserted === 0) {
      await finishSyncLog(logId, 'failed', 0, errors.join('; '));
    } else {
      await finishSyncLog(logId, 'success', totalUpserted, errors.length > 0 ? errors.join('; ') : undefined);
    }
    console.log(`[job-ga4] Done — ${totalUpserted} rows upserted, ${errors.length} errors`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[job-ga4] Fatal:', err);
    await finishSyncLog(logId, 'failed', totalUpserted, msg);
  }
}
