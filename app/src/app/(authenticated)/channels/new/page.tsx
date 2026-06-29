// Platform picker at /channels/new — entry point for connecting a new social
// channel. Facebook lands here with its native flow (page id + token) by routing
// to /channels/new/facebook. All other platforms use Bundle.social OAuth and
// surface their connect URL through <BundleConnectPanel>.
//
// Server component (default) — auth gate + render grid. Tile interactions live
// in <PlatformPickerGrid> (client).

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { PLATFORMS } from '@/lib/platforms/registry';
import { PlatformPickerGrid } from './platform-picker-grid';

export const metadata: Metadata = {
  title: 'Kết nối kênh mới — Marketing OS',
};

export default async function ChannelsNewPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/channels/new');
  }

  // Split into two visual groups so the picker stays scannable.
  // "Available" = importable today; "Coming soon" = publish-only or unsupported.
  const available = PLATFORMS.filter((p) => p.importSupported);
  const comingSoon = PLATFORMS.filter((p) => !p.importSupported);

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Kết nối kênh mới</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Chọn nền tảng bạn muốn kết nối. Facebook dùng flow native (page id + token),
          các nền tảng khác đi qua Bundle.social OAuth.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Khả dụng ({available.length})
        </h3>
        <PlatformPickerGrid platforms={available} />
      </section>

      {comingSoon.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Sắp ra mắt ({comingSoon.length})
          </h3>
          <PlatformPickerGrid platforms={comingSoon} disabled />
        </section>
      )}

      {/* Nguồn không có API (vd Facebook cá nhân) → nhập số liệu thủ công */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Khác
        </h3>
        <Link
          href="/channels/new/manual"
          className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-4 text-sm text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 transition-colors"
        >
          <span className="font-medium text-zinc-800">✍️ Kênh thủ công</span>
          <span className="block text-xs text-zinc-500 mt-0.5">
            Nguồn không có API (Facebook cá nhân…) — tự nhập followers / reach / engagement.
          </span>
        </Link>
      </section>

      <p className="text-center text-sm text-zinc-400 pt-2">
        <Link href="/channels" className="hover:underline">
          ← Quay lại danh sách kênh
        </Link>
      </p>
    </div>
  );
}
