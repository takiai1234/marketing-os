// Job L — GA4 sessions + Google Sheets leads sync (chạy daily 00:30 VN).
// Với mỗi landing_page active:
//   - Fetch sessions từ GA4 Data API → upsert vào landing_page_daily
//   - Fetch leads từ Google Sheet (cột Thời gian) → upsert vào landing_page_leads_daily

import { db } from '@/lib/db';
import { fetchGa4Sessions } from '@/lib/google/ga4-client';
import { fetchSheetLeadsByDay } from '@/lib/google/sheets-client';
import { startSyncLog, finishSyncLog } from '@/lib/cron/sync-log';

interface LandingPageRow {
  id: string;
  name: string;
  page_path: string;
  ga4_property_id: string;
  sheet_id: string | null;
  sheet_name: string | null;
  sheet_source_filter: string | null;
  sheet_source_column: string | null;
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
  const errors: string[] = [];

  try {
    const { rows: pages } = await db.query<LandingPageRow>(
      `SELECT id, name, page_path, ga4_property_id, sheet_id, sheet_name,
              sheet_source_filter, sheet_source_column
         FROM landing_page
        WHERE is_active = TRUE`
    );

    if (pages.length === 0) {
      await finishSyncLog(logId, 'success', 0, 'Không có landing page nào active');
      return;
    }

    const startDate = nDaysAgo(30);
    const endDate = today();

    // ── 1. GA4 sessions ──────────────────────────────────────────────────────
    const byProperty = new Map<string, LandingPageRow[]>();
    for (const p of pages) {
      const arr = byProperty.get(p.ga4_property_id) ?? [];
      arr.push(p);
      byProperty.set(p.ga4_property_id, arr);
    }

    for (const [propertyId, propertyPages] of byProperty) {
      let rows;
      try {
        rows = await fetchGa4Sessions(propertyId, startDate, endDate);
        console.log(`[job-ga4] property=${propertyId} → ${rows.length} rows`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[job-ga4] property=${propertyId} fetch failed:`, msg);
        errors.push(`GA4 property ${propertyId}: ${msg}`);
        continue;
      }

      for (const page of propertyPages) {
        const pageRows = rows.filter((r) => r.pagePath === page.page_path);
        if (pageRows.length === 0) continue;
        for (const r of pageRows) {
          await db.query(
            `INSERT INTO landing_page_daily (landing_page_id, date, sessions, updated_at)
             VALUES ($1, $2::date, $3, NOW())
             ON CONFLICT (landing_page_id, date) DO UPDATE
               SET sessions = EXCLUDED.sessions, updated_at = NOW()`,
            [page.id, r.date, r.sessions]
          );
          totalUpserted++;
        }
      }
    }

    // ── 2. Google Sheets leads ────────────────────────────────────────────────
    for (const page of pages) {
      if (!page.sheet_id || !page.sheet_name) continue;
      try {
        const leadRows = await fetchSheetLeadsByDay(page.sheet_id, page.sheet_name, {
          sourceFilter: page.sheet_source_filter ?? undefined,
        });
        console.log(`[job-ga4] sheet "${page.name}" → ${leadRows.length} ngày`);
        for (const r of leadRows) {
          await db.query(
            `INSERT INTO landing_page_leads_daily (landing_page_id, date, leads, updated_at)
             VALUES ($1, $2::date, $3, NOW())
             ON CONFLICT (landing_page_id, date) DO UPDATE
               SET leads = EXCLUDED.leads, updated_at = NOW()`,
            [page.id, r.date, r.count]
          );
          totalUpserted++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[job-ga4] sheet "${page.name}" failed:`, msg);
        errors.push(`Sheet "${page.name}": ${msg}`);
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
