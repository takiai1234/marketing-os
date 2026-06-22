// Layout cho /settings/* — title + sub-nav giữa Tài khoản / Tích hợp / ...
// Client component cho nav (cần usePathname để highlight active tab).

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  /** True nếu chỉ admin được vào — non-admin vẫn thấy tab nhưng page sẽ
   *  hiện forbidden card. Có thể cải tiến sau bằng cách hide tab. */
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Tài khoản', href: '/settings/account' },
  { label: 'Tích hợp API', href: '/settings/integrations', adminOnly: true },
  { label: 'Nhóm kênh', href: '/settings/channel-tags', adminOnly: true },
  { label: 'Debug Dashboard', href: '/settings/dashboard-debug', adminOnly: true },
  { label: 'Debug Kênh/Team', href: '/settings/team-data-debug', adminOnly: true },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold text-zinc-900 mb-4">Cài đặt</h2>

      {/* Sub-nav tabs */}
      <nav className="flex gap-1 mb-6 border-b border-zinc-200">
        {NAV.map((item) => {
          const isActive = pathname?.startsWith(item.href) ?? false;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'inline-flex items-center px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300'
              )}
            >
              {item.label}
              {item.adminOnly && (
                <span className="ml-1.5 text-[9px] font-bold uppercase text-amber-600 tracking-wider">
                  ADMIN
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
