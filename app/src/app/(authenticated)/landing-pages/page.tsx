import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { db } from '@/lib/db';
import { LandingPagesClient } from './landing-pages-client';

export const metadata = { title: 'Landing Pages — Marketing OS' };

export default async function LandingPagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return (
      <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-5 py-5">
        <h2 className="text-base font-semibold text-amber-900 mb-1">Chỉ admin truy cập</h2>
      </div>
    );
  }

  const { rows } = await db.query<{
    id: string;
    name: string;
    page_path: string;
    ga4_property_id: string;
    sheet_id: string | null;
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
       lp.sheet_id,
       lp.sheet_name,
       lp.is_active,
       COALESCE(SUM(lpd.sessions) FILTER (WHERE lpd.date >= CURRENT_DATE - 29), 0)::text AS sessions_30d,
       COALESCE(SUM(lld.leads)    FILTER (WHERE lld.date >= CURRENT_DATE - 29), 0)::text AS leads_30d
     FROM landing_page lp
     LEFT JOIN landing_page_daily lpd ON lpd.landing_page_id = lp.id
     LEFT JOIN landing_page_leads_daily lld ON lld.landing_page_id = lp.id
     GROUP BY lp.id
     ORDER BY lp.name`
  );

  const pages = rows.map(r => {
    const sessions = parseInt(r.sessions_30d, 10);
    const leads = parseInt(r.leads_30d, 10);
    return {
      id: r.id,
      name: r.name,
      pagePath: r.page_path,
      ga4PropertyId: r.ga4_property_id,
      sheetId: r.sheet_id,
      sheetName: r.sheet_name,
      isActive: r.is_active,
      sessions30d: sessions,
      leads30d: leads,
      conversionRate: sessions > 0 ? (leads / sessions) * 100 : null,
    };
  });

  return <LandingPagesClient initialPages={pages} />;
}
