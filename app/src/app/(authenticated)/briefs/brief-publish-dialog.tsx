'use client';

// Dialog "Đăng lên kênh" — chọn Facebook Page, preview nội dung, đăng.
// Phase 1 chỉ Facebook Page; kênh khác (Bundle.social) sẽ vào phase sau.
// Sau khi đăng OK: hiện link bài + gọi onPublished(brief) để board cập nhật state.

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Brief } from '@/lib/briefs/brief-types';
import type {
  BriefPublication,
  PublishableChannel,
} from '@/lib/queries/brief-publications';

interface BriefPublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brief: Brief | null;
  /** Gọi sau khi đăng thành công — brief server trả về (status có thể đã đổi) */
  onPublished: (brief: Brief) => void;
}

export function BriefPublishDialog({
  open,
  onOpenChange,
  brief,
  onPublished,
}: BriefPublishDialogProps) {
  const [channels, setChannels] = useState<PublishableChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successPermalink, setSuccessPermalink] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  // Load danh sách kênh mỗi lần mở dialog + reset state phiên trước
  useEffect(() => {
    if (!open) return;
    setError(null);
    setPublished(false);
    setSuccessPermalink(null);
    setSelectedChannelId(null);
    setLoadingChannels(true);

    let cancelled = false;
    fetch('/api/channels/publishable')
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      })
      .then((data: { channels: PublishableChannel[] }) => {
        if (cancelled) return;
        setChannels(data.channels);
        // Auto-chọn khi chỉ có 1 kênh — đỡ 1 click
        if (data.channels.length === 1) setSelectedChannelId(data.channels[0]!.id);
        setLoadingChannels(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Lỗi tải danh sách kênh');
        setLoadingChannels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handlePublish() {
    if (!brief || !selectedChannelId || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/briefs/${brief.id}/publications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: selectedChannelId }),
      });
      const data = (await res.json()) as {
        publication?: BriefPublication;
        brief?: Brief;
        error?: string;
      };
      if (!res.ok || !data.publication) {
        throw new Error(data.error ?? 'Đăng thất bại');
      }
      setPublished(true);
      setSuccessPermalink(data.publication.permalink_url);
      if (data.brief) onPublished(data.brief);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng thất bại');
    } finally {
      setPublishing(false);
    }
  }

  if (!brief) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Đăng lên kênh</DialogTitle>
          <DialogDescription>
            Đăng nội dung bài viết của brief lên Facebook Page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Chọn kênh */}
          <div>
            <p className="text-sm font-medium text-zinc-900 mb-2">Chọn kênh</p>
            {loadingChannels ? (
              <p className="text-sm text-zinc-400 italic">Đang tải kênh…</p>
            ) : channels.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Chưa có Facebook Page nào đủ điều kiện. Kết nối Page ở trang
                Channels trước.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {channels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    disabled={published}
                    onClick={() => setSelectedChannelId(ch.id)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left ring-1 transition-colors ${
                      selectedChannelId === ch.id
                        ? 'ring-amber-500 bg-amber-50 text-zinc-900'
                        : 'ring-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="size-2 rounded-full bg-blue-500 shrink-0" />
                    {ch.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview nội dung sẽ đăng */}
          <div>
            <p className="text-sm font-medium text-zinc-900 mb-2">
              Nội dung sẽ đăng
            </p>
            <div className="rounded-lg ring-1 ring-zinc-200 bg-zinc-50/50 px-3 py-2 max-h-48 overflow-y-auto">
              <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">
                {brief.draft_content}
              </p>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-700">
              ⚠️ {error}
            </p>
          )}

          {published && (
            <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-sm text-emerald-700">
              ✅ Đã đăng thành công!{' '}
              {successPermalink && (
                <a
                  href={successPermalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium underline"
                >
                  Xem bài viết <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {published ? 'Đóng' : 'Huỷ'}
          </Button>
          {!published && (
            <Button
              type="button"
              size="sm"
              disabled={!selectedChannelId || publishing || channels.length === 0}
              onClick={handlePublish}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {publishing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Đang đăng…
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  Đăng ngay
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
