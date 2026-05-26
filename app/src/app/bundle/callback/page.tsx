// Public Bundle.social OAuth callback.
//
// Bundle redirects users here after they complete OAuth on its side. Lives
// OUTSIDE (authenticated) because the second device (phone, friend's laptop)
// completing the OAuth typically isn't logged into our app — the random 64-char
// state token is the security boundary.
//
// Behaviour:
//   - Same browser as initiator (cookie matches session.owner_member_id):
//     finalize → redirect to /channels so the new tile appears immediately.
//   - Different browser (cross-device share):
//     finalize → render a friendly "đóng tab này" success page; the channel
//     pops up on the initiator's machine when they reload /channels.

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { finalizeBundleSession, type FinalizeOutcome } from '@/lib/bundle/finalize';

export const metadata: Metadata = {
  title: 'Hoàn tất kết nối — Marketing OS',
};

interface PageProps {
  searchParams: Promise<{ session?: string }>;
}

export default async function BundleCallbackPage({ searchParams }: PageProps) {
  const { session: stateToken } = await searchParams;

  if (!stateToken) {
    return <ErrorCard title="Thiếu mã session" message="URL không có ?session= token." />;
  }

  const user = await getCurrentUser();
  const outcome: FinalizeOutcome = await finalizeBundleSession({
    stateToken,
    currentUserId: user?.userId ?? null,
  });

  // Initiator's own browser → bounce them straight to the channel list.
  if (outcome.ok && user) {
    redirect('/channels');
  }

  // Either cross-device success or any failure → render a status card.
  if (outcome.ok) {
    return <SuccessCard platform={outcome.platform} />;
  }
  return <ErrorCard title="Không hoàn tất kết nối được" message={outcome.message} />;
}

function SuccessCard({ platform }: { platform: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-2xl">
          ✓
        </div>
        <h1 className="mt-4 text-xl font-bold text-zinc-900">Kết nối thành công</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Tài khoản <strong>{platform}</strong> đã được liên kết. Bạn có thể đóng tab này —
          channel sẽ tự xuất hiện trên thiết bị ban đầu khi reload trang{' '}
          <code className="bg-zinc-100 px-1 rounded">/channels</code>.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/channels"
            className="inline-flex items-center justify-center rounded-md bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-sm font-medium"
          >
            Mở /channels
          </Link>
          <p className="text-xs text-zinc-500">Hoặc đóng tab này bằng Ctrl+W.</p>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-2xl">
          ✗
        </div>
        <h1 className="mt-4 text-xl font-bold text-zinc-900">{title}</h1>
        <p className="mt-2 text-sm text-zinc-600">{message}</p>
        <Link
          href="/channels/new"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-sm font-medium"
        >
          Quay lại chọn nền tảng
        </Link>
      </div>
    </div>
  );
}
