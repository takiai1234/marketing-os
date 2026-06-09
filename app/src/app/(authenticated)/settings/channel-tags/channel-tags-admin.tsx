'use client';

// CRUD client cho /settings/channel-tags.
// - List tag dạng table (name, slug, sort_order)
// - Inline edit name + sort
// - Delete với confirm
// - Add form ở cuối

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ChannelTag } from '@/lib/queries/channel-tags';

interface Props {
  initialTags: ChannelTag[];
}

export function ChannelTagsAdmin({ initialTags }: Props) {
  const router = useRouter();
  const [tags, setTags] = useState<ChannelTag[]>(initialTags);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // New tag form
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  async function refresh() {
    const res = await fetch('/api/channel-tags');
    if (!res.ok) return;
    const data = (await res.json()) as { tags: ChannelTag[] };
    setTags(data.tags);
    startTransition(() => router.refresh());
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) {
      setError('Nhập tên nhóm');
      return;
    }
    const res = await fetch('/api/channel-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        slug: newSlug.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    setNewName('');
    setNewSlug('');
    await refresh();
  }

  async function handleRename(id: string, name: string) {
    setError(null);
    const res = await fetch(`/api/channel-tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    await refresh();
  }

  async function handleSort(id: string, sortOrder: number) {
    const res = await fetch(`/api/channel-tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sortOrder }),
    });
    if (!res.ok) return;
    await refresh();
  }

  async function handleDelete(id: string, name: string) {
    const ok = window.confirm(
      `Xoá nhóm "${name}"? Mọi kênh đang được gán nhóm này sẽ bị bóc tag (không xoá kênh).`
    );
    if (!ok) return;
    const res = await fetch(`/api/channel-tags/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `HTTP ${res.status}`);
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      >
        <h4 className="text-sm font-semibold text-zinc-900 mb-3">+ Thêm nhóm</h4>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2">
          <input
            type="text"
            placeholder="Tên nhóm (vd. Kênh CEO)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Slug (tùy chọn — auto từ tên)"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
            pattern="[a-z0-9-]+"
            title="Chỉ a-z 0-9 -"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            Tạo
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </form>

      {/* List */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2 text-left">Tên nhóm</th>
              <th className="px-4 py-2 text-left">Slug</th>
              <th className="px-4 py-2 text-left w-24">Thứ tự</th>
              <th className="px-4 py-2 text-right w-32">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {tags.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                  Chưa có nhóm nào — thêm ở form trên.
                </td>
              </tr>
            ) : (
              tags.map((t) => (
                <TagRow
                  key={t.id}
                  tag={t}
                  onRename={(name) => handleRename(t.id, name)}
                  onSort={(order) => handleSort(t.id, order)}
                  onDelete={() => handleDelete(t.id, t.name)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Mẹo: Thứ tự nhỏ hơn → tab lên trước trên Dashboard. Khi xoá nhóm, mọi
        kênh đã gán bị bóc tag (không xoá kênh).
      </p>
    </div>
  );
}

// ─── Row component — inline edit name + sort ───────────────────────────

function TagRow({
  tag,
  onRename,
  onSort,
  onDelete,
}: {
  tag: ChannelTag;
  onRename: (name: string) => void;
  onSort: (order: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const [sort, setSort] = useState(tag.sortOrder);

  return (
    <tr className="border-t border-zinc-100">
      <td className="px-4 py-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name.trim() !== tag.name) onRename(name.trim());
          }}
          className="w-full rounded-md border border-transparent px-2 py-1 hover:border-zinc-200 focus:border-orange-400 focus:outline-none"
        />
      </td>
      <td className="px-4 py-2 font-mono text-xs text-zinc-500">{tag.slug}</td>
      <td className="px-4 py-2">
        <input
          type="number"
          value={sort}
          onChange={(e) => setSort(Number(e.target.value))}
          onBlur={() => {
            if (sort !== tag.sortOrder) onSort(sort);
          }}
          className="w-16 rounded-md border border-zinc-200 px-2 py-1 text-sm"
          min={0}
        />
      </td>
      <td className="px-4 py-2 text-right">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-red-600 hover:underline"
        >
          Xoá
        </button>
      </td>
    </tr>
  );
}
