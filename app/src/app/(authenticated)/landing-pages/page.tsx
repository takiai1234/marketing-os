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

  const [pagesRes, accountsRes] = await Promise.all([
    db.query<{
      id: string; name: string; page_path: string; ga4_property_id: string;
      account_id: string | null; account_name: string | null; is_active: boolean;
      sessions_30d: string; leads_30d: string;
    }>(
      `SELECT
         lp.id, lp.name, lp.page_path, lp.ga4_property_id, lp.account_id,
         sa.name AS account_name, lp.is_active,
         COALESCE(SUM(lpd.sessions) FILTER (WHERE lpd.date >= CURRENT_DATE - 29), 0)::text AS sessions_30d,
         COALESCE(SUM(lpc.conversion_count) FILTER (WHERE lpc.occurred_date >= CURRENT_DATE - 29), 0)::text AS leads_30d
       FROM landing_page lp
       LEFT JOIN social_account sa ON sa.id = lp.account_id
       LEFT JOIN landing_page_daily lpd ON lpd.landing_page_id = lp.id
       LEFT JOIN landing_page_conversion lpc ON lpc.account_id = lp.account_id
       GROUP BY lp.id, sa.name
       ORDER BY lp.name`
    ),

    db.query<{ id: string; name: string }>(
      `SELECT sa.id, sa.name
         FROM social_account sa
         JOIN social_account_member sam ON sam.account_id = sa.id
         JOIN team_member tm ON tm.id = sam.member_id
        WHERE tm.id = $1
          AND sa.platform = 'facebook'
          AND sa.status = 'active'
        ORDER BY sa.name`,
      [user.userId]
    ),
  ]);

  const pages = pagesRes.rows.map(r => ({
    id: r.id,
    name: r.name,
    pagePath: r.page_path,
    ga4PropertyId: r.ga4_property_id,
    accountId: r.account_id,
    accountName: r.account_name,
    isActive: r.is_active,
    sessions30d: parseInt(r.sessions_30d, 10),
    leads30d: parseInt(r.leads_30d, 10),
    conversionRate: parseInt(r.sessions_30d, 10) > 0
      ? (parseInt(r.leads_30d, 10) / parseInt(r.sessions_30d, 10)) * 100
      : null,
  }));

  return (
    <LandingPagesClient
      initialPages={pages}
      accounts={accountsRes.rows}
    />
  );
}
