import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { ManualChannelForm } from './manual-channel-form';

export const metadata: Metadata = {
  title: 'Kênh thủ công — Marketing OS',
};

export default async function ManualChannelPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/channels/new/manual');
  const isAdmin = (await getUserRole(user.userId)) === 'admin';

  return (
    <div className="max-w-md mx-auto flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Tạo kênh thủ công</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Dùng cho nguồn không có API (vd Facebook cá nhân). Bạn tự nhập số liệu
          định kỳ; dashboard cộng vào như kênh thường.
        </p>
      </div>

      {isAdmin ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <ManualChannelForm />
        </div>
      ) : (
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-5 py-4 text-sm text-amber-800">
          Chỉ admin mới tạo được kênh thủ công.
        </div>
      )}

      <p className="text-center text-sm text-zinc-400">
        <Link href="/channels/new" className="hover:underline">← Quay lại chọn nền tảng</Link>
      </p>
    </div>
  );
}
