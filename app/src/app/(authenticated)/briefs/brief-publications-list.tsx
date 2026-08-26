'use client';

// Danh sách các lần đăng kênh của 1 brief — render trong detail view.
// Tự fetch từ /api/briefs/[id]/publications; refetch khi refetchKey bump
// (sau khi đăng thành công board bump activityRefetchKey chung).

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { BriefPublication } from '@/lib/queries/brief-publications';

interface BriefPublicationsListProps {
  briefId: string;
  refetchKey: number;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

const STATUS_BADGE: Record<BriefPublication['status'], { label: string; cls: string }> = {
  publishing: { label: 'Đang đăng', cls: 'bg-amber-100 text-amber-700' },
  published:  { label: 'Đã đăng',   cls: 'bg-emerald-100 text-emerald-700' },
  failed:     { label: 'Thất bại',  cls: 'bg-rose-100 text-rose-700' },
};

export function BriefPublicationsList({ briefId, refetchKey }: BriefPublicationsListProps) {
  const [publications, setPublications] = useState<BriefPublication[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/briefs/${briefId}/publications`)
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      })
      .then((data: { publications: BriefPublication[] }) => {
        if (cancelled) return;
        setPublications(data.publications);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [briefId, refetchKey]);

  if (loading && publications.length === 0) {
    return <p className="text-xs text-zinc-400 italic">Đang tải…</p>;
  }
  if (publications.length === 0) {
    return <p className="text-xs text-zinc-400 italic">Chưa đăng lên kênh nào.</p>;
  }

  return (
    <ul className="space-y-2">
      {publications.map((p) => {
        const badge = STATUS_BADGE[p.status];
        return (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-lg ring-1 ring-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <span
              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}
            >
              {badge.label}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-zinc-800 truncate">
                {p.channel_name}
                {p.published_by_name && (
                  <span className="text-zinc-400"> · {p.published_by_name}</span>
                )}
              </p>
              {p.status === 'failed' && p.error_message && (
                <p className="text-xs text-rose-600 truncate" title={p.error_message}>
                  {p.error_message}
                </p>
              )}
            </div>
            <span className="text-xs text-zinc-400 font-mono shrink-0">
              {formatTime(p.published_at ?? p.created_at)}
            </span>
            {p.permalink_url && (
              <a
                href={p.permalink_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-amber-600 hover:text-amber-700"
                title="Xem bài viết"
              >
                <ExternalLink className="size-4" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
