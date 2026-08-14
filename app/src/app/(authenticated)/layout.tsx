import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { normalizeRole, isGuest } from '@/lib/auth/roles';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { ReadOnlyBanner } from '@/components/layout/read-only-banner';
import { RoleProvider } from '@/components/auth/role-provider';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const role = normalizeRole(await getUserRole(user.userId));

  return (
    <RoleProvider role={role}>
      <div className="flex min-h-screen bg-zinc-50">
        <SidebarNav user={user} role={role} />
        <main className="flex-1 overflow-auto p-6 min-w-0">
          {isGuest(role) && <ReadOnlyBanner />}
          {children}
        </main>
      </div>
    </RoleProvider>
  );
}
