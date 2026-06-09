'use client';

// Multi-select chip control để admin gán/bỏ tag cho 1 kênh.
// Click chip → toggle. Auto-save qua PUT /api/channels/[id]/tags.
//
// Non-admin: read-only — chỉ render chips active, không có nút bỏ chọn.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ChannelTag } from '@/lib/queries/channel-tags';
import { cn } from '@/lib/utils';

interface ChannelTagsEditorProps {
  channelId: string;
  allTags: ChannelTag[];
  /** Tag-ids đang được gán cho channel (server-fetched). */
  selectedTagIds: string[];
  isAdmin: boolean;
}

export function ChannelTagsEditor({
  channelId,
  allTags,
  selectedTagIds: initialSelected,
  isAdmin,
}: ChannelTagsEditorProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelected)
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Empty state cho non-admin + chưa có tag → ẩn hoàn toàn để khỏi chiếm chỗ.
  if (!isAdmin && allTags.length === 0) return null;
  if (!isAdmin && selected.size === 0) return null;

  async function save(nextSet: Set<string>) {
    setError(null);
    const tagIds = Array.from(nextSet);
    try {
      const res = await fetch(`/api/channels/${channelId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      // Refresh server components — dashboard cache đã invalidate phía server.
      startTransition(() => router.refresh());
    } catch (err) {
      // Rollback optimistic update
      setSelected(new Set(initialSelected));
      setError(err instanceof Error ? err.message : 'Lưu tag thất bại');
    }
  }

  function toggle(tagId: string) {
    if (!isAdmin) return;
    const next = new Set(selected);
    if (next.has(tagId)) {
      next.delete(tagId);
    } else {
      next.add(tagId);
    }
    setSelected(next); // optimistic
    void save(next);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Nhóm kênh</h3>
        {isAdmin && (
          <span className="text-xs text-zinc-500">
            {selected.size === 0 ? 'Chưa gán nhóm' : `${selected.size} nhóm`}
            {isPending ? ' · đang lưu…' : ''}
          </span>
        )}
      </div>

      {allTags.length === 0 ? (
        <p className="text-xs text-zinc-500">
          Chưa có nhóm nào.{' '}
          <a
            href="/settings/channel-tags"
            className="text-orange-600 hover:underline font-medium"
          >
            Tạo nhóm tại Settings
          </a>
          .
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const isOn = selected.has(tag.id);
            // Non-admin chỉ render tag đã gán
            if (!isAdmin && !isOn) return null;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                disabled={!isAdmin || isPending}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  isOn
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50',
                  !isAdmin && 'cursor-default'
                )}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}

      {isAdmin && allTags.length > 0 && (
        <p className="mt-2 text-xs text-zinc-400">
          Click chip để bật/tắt. Dashboard tab tương ứng sẽ refresh sau khi lưu.
        </p>
      )}
    </div>
  );
}
