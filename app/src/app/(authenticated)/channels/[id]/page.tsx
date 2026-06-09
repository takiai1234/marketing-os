import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  fetchChannel,
  fetchMetrics7d,
  fetchRecentPosts,
  fetchSyncLog,
} from '@/lib/queries/channel-detail';
import { fetchTeamMembers } from '@/lib/queries/team-members';
import { fetchChannelMembers } from '@/lib/queries/channel-members';
import { fetchChannelMessages7d } from '@/lib/queries/dashboard-messages';
import { listAllTags, getTagsForAccount } from '@/lib/queries/channel-tags';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { ChannelHeader } from './channel-header';
import { ChannelTagsEditor } from './channel-tags-editor';
import { PersonaPanel } from './persona-panel';
import { MetricsTrendChart } from './metrics-trend-chart';
import { MessagesTrendChart } from './messages-trend-chart';
import { RecentPostsList } from './recent-posts-list';
import { SyncLogTable } from './sync-log-table';
import { BackButton } from './back-button';

export const metadata: Metadata = {
  title: 'Chi tiết kênh — Marketing OS',
};

// Basic UUID format check — reject obviously invalid ids before hitting DB
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ChannelDetailPage({ params }: PageProps) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    notFound();
  }

  const account = await fetchChannel(id);
  if (!account) {
    notFound();
  }

  // Layout (authenticated) đã chặn user null → redirect /login. Ở đây user
  // an toàn != null, nhưng vẫn check defensive để TS narrow type.
  const user = await getCurrentUser();
  const role = user ? await getUserRole(user.userId) : null;
  const isAdmin = role === 'admin';

  // Channel members list — fetch luôn cho mọi user (kể cả non-admin) vì
  // chips display read-only cũng cần data. Pool team_member chỉ fetch
  // cho admin (dùng cho dropdown "Thêm thành viên" trong edit dialog).
  const [
    metrics,
    messages,
    posts,
    syncLog,
    channelMembers,
    allTeamMembers,
    allTags,
    channelTags,
  ] = await Promise.all([
    fetchMetrics7d(id),
    fetchChannelMessages7d(id),
    fetchRecentPosts(id, 10),
    fetchSyncLog(id, 10),
    fetchChannelMembers(id),
    isAdmin ? fetchTeamMembers() : Promise.resolve([]),
    listAllTags(),
    getTagsForAccount(id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <BackButton />
      <ChannelHeader
        accountId={account.id}
        externalId={account.externalId}
        name={account.name}
        platform={account.platform}
        status={account.status}
        lastSyncedAt={account.lastSyncedAt}
        channelMembers={channelMembers}
        allTeamMembers={allTeamMembers}
        kpiPostsPerDay={account.kpiPostsPerDay}
        isAdmin={isAdmin}
      />

      

      <ChannelTagsEditor
        channelId={id}
        allTags={allTags}
        selectedTagIds={channelTags.map((t) => t.id)}
        isAdmin={isAdmin}
      />

      <MetricsTrendChart data={metrics} />

      <MessagesTrendChart data={messages} />

      <RecentPostsList posts={posts} />

      <SyncLogTable entries={syncLog} />
    </div>
  );
}
