'use client';

// EditMemberDialog — admin sửa name / email / role của 1 team member.
// PUT /api/team-members/[id]. Self-demote (đổi role chính mình) bị chặn cả ở
// UI (disable select khi isSelf) lẫn server.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  id: string;
  initialName: string;
  initialEmail: string;
  initialRole: string;
  /** true nếu đây là tài khoản của chính admin đang đăng nhập → khoá đổi role. */
  isSelf: boolean;
}

export function EditMemberDialog({
  id,
  initialName,
  initialEmail,
  initialRole,
  isSelf,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [role, setRole] = useState(initialRole === 'admin' ? 'admin' : 'member');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Reset về giá trị gốc mỗi lần mở (đề phòng sửa dở rồi đóng).
      setName(initialName);
      setEmail(initialEmail);
      setRole(initialRole === 'admin' ? 'admin' : 'member');
      setError(null);
    }
    if (!next) setLoading(false);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (name.trim().length === 0) {
      setError('Tên không được để trống');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/team-members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      });

      if (res.ok) {
        toast.success(`Đã cập nhật thông tin cho ${name.trim()}`);
        handleOpenChange(false);
        router.refresh();
        return;
      }

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? 'Không thể cập nhật');
    } catch {
      setError('Lỗi kết nối — thử lại sau');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            title={`Sửa thông tin ${initialName}`}
            className="inline-flex items-center text-zinc-400 hover:text-blue-600"
          >
            <Pencil className="size-3.5" />
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa thông tin thành viên</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-name" className="text-xs font-medium text-zinc-700">
              Tên
            </label>
            <input
              id="edit-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 transition-colors focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-email" className="text-xs font-medium text-zinc-700">
              Email
            </label>
            <input
              id="edit-email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 transition-colors focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-role" className="text-xs font-medium text-zinc-700">
              Vai trò
            </label>
            <select
              id="edit-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={loading || isSelf}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 transition-colors focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50"
            >
              <option value="member">Member — chỉ xem/thao tác kênh được gán</option>
              <option value="admin">Admin — toàn quyền</option>
            </select>
            {isSelf && (
              <p className="text-[11px] text-amber-600">
                Không thể tự đổi vai trò của chính bạn (tránh tự khoá quyền admin).
              </p>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs text-red-700"
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={loading}>
                  Huỷ
                </Button>
              }
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
