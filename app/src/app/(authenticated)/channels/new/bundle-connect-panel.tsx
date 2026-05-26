'use client';

// Shown after the user picks a Bundle-mediated platform. Displays the OAuth URL
// from Bundle (`/social-account/connect`) — user can either click "Mở link" to
// open in a new tab, or copy and paste somewhere (eg. another device's browser).
//
// After they complete OAuth on Bundle's side, Bundle redirects back to
// /channels?bundle_session=<token>. The /channels page handles the finalize.

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Props {
  connectUrl: string;
  platformLabel: string;
  expiresAt: string;
  onClose: () => void;
}

export function BundleConnectPanel({ connectUrl, platformLabel, expiresAt, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const expiresAtDate = new Date(expiresAt);
  const minutesLeft = Math.max(0, Math.round((expiresAtDate.getTime() - Date.now()) / 60_000));

  async function copy() {
    try {
      await navigator.clipboard.writeText(connectUrl);
      setCopied(true);
      toast.success('Đã copy link');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Không copy được — chọn URL rồi Ctrl+C thủ công.');
    }
  }

  // No openInNewTab() helper — we render a real <a href> so:
  //   * Plain click → same tab (default, what the user asked for)
  //   * Ctrl/Cmd-click or middle-click → new tab (browser default, still works)
  // Avoids window.open which forces a single behavior and triggers popup blockers.

  return (
    <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-zinc-900">
            Kết nối {platformLabel} qua Bundle
          </h4>
          <p className="mt-1 text-xs text-zinc-600">
            Bấm <strong>"Mở link"</strong> để đăng nhập tài khoản{' '}
            <strong>{platformLabel}</strong> ngay tại tab này. Hoặc copy URL gửi sang
            thiết bị khác (điện thoại, máy bạn khác) — kết nối xong là channel sẽ tự
            xuất hiện ở danh sách.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="text-zinc-400 hover:text-zinc-600 -mt-1 -mr-1 p-1"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          readOnly
          value={connectUrl}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-mono text-zinc-700 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        <Button
          type="button"
          onClick={copy}
          variant="outline"
          className="border-orange-300 hover:bg-orange-100"
        >
          {copied ? '✓ Đã copy' : 'Copy'}
        </Button>
        <a
          href={connectUrl}
          className="inline-flex items-center justify-center rounded-md bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-sm font-medium transition-colors"
        >
          Mở link →
        </a>
      </div>

      <p className="mt-3 text-[11px] text-zinc-500">
        Link hết hạn sau {minutesLeft} phút. Sau khi hết hạn cần bấm tile lại để tạo link mới.
      </p>
    </div>
  );
}
