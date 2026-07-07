import { db } from '@/lib/db';

export interface DashboardLandingPage {
  id: string;
  name: string;
  pagePath: string;
  ga4PropertyId: string;
  sheetName: string | null;
  isActive: boolean;
  sessions30d: number;
  leads30d: number;
  conversionRate: number | null;
}

export async function fetchDashboardLandingPages(): Promise<DashboardLandingPage[]> {
  const { rows } = await db.query<{
    id: string;
    name: string;
    page_path: string;
    ga4_property_id: string;
    sheet_name: string | null;
    is_active: boolean;
    sessions_30d: string;
    leads_30d: string;
  }>(
    `SELECT
       lp.id,
       lp.name,
       lp.page_path,
       lp.ga4_property_id,
       lp.sheet_name,
       lp.is_active,
       COALESCE(s.sessions_30d, 0)::text AS sessions_30d,
       COALESCE(l.leads_30d, 0)::text    AS leads_30d
     FROM landing_page lp
     LEFT JOIN (
       SELECT landing_page_id, SUM(sessions) AS sessions_30d
         FROM landing_page_daily
        WHERE date >= CURRENT_DATE - 29
        GROUP BY landing_page_id
     ) s ON s.landing_page_id = lp.id
     LEFT JOIN (
       SELECT landing_page_id, SUM(leads) AS leads_30d
         FROM landing_page_leads_daily
        WHERE date >= CURRENT_DATE - 29
        GROUP BY landing_page_id
     ) l ON l.landing_page_id = lp.id
     ORDER BY leads_30d DESC NULLS LAST, lp.name`
  );

  return rows.map((r) => {
    const sessions = parseInt(r.sessions_30d, 10);
    const leads = parseInt(r.leads_30d, 10);
    return {
      id: r.id,
      name: r.name,
      pagePath: r.page_path,
      ga4PropertyId: r.ga4_property_id,
      sheetName: r.sheet_name,
      isActive: r.is_active,
      sessions30d: sessions,
      leads30d: leads,
      conversionRate: sessions > 0 ? (leads / sessions) * 100 : null,
    };
  });
}
