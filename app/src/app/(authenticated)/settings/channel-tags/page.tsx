import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { listAllTags } from '@/lib/queries/channel-tags';
import { ChannelTagsAdmin } from './channel-tags-admin';

export const metadata: Metadata = {
  title: 'Nhóm kênh — Cài đặt',
};

export default async function ChannelTagsSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm text-amber-700">
          Chỉ admin mới quản lý được nhóm kênh.
        </p>
      </div>
    );
  }

  const tags = await listAllTags();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-zinc-900">Nhóm kênh</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Tag để phân nhóm kênh trên Dashboard. Mỗi kênh có thể nhiều tag. Slug
          KHÔNG đổi được sau khi tạo (vì URL bookmark phụ thuộc).
        </p>
      </div>

      <ChannelTagsAdmin initialTags={tags} />
    </div>
  );
}
