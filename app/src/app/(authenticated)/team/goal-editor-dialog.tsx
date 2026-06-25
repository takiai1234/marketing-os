'use client';

// Admin-only dialog để set 3 mục tiêu 30 ngày cho 1 nhân viên.
// Trigger: nút "Sửa mục tiêu" trên team-member-card (admin thấy, member khác
// không thấy — control ở page.tsx renderAction). Submit PATCH
// /api/team-members/[id]/goals → router.refresh() để re-fetch KPI.

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { TargetIcon } from 'lucide-react';

interface Props {
  memberId: string;
  memberName: string;
  /** Current values (truyền từ TeamMemberKpi.goals). Số 0 = chưa đặt. */
  initialFollowGrowth: number;
  initialReach: number;
  initialPostsPerChannel: number;
}

export function GoalEditorDialog({
  memberId,
  memberName,
  initialFollowGrowth,
  initialReach,
  initialPostsPerChannel,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [follow, setFollow] = useState(String(initialFollowGrowth));
  const [reach, setReach] = useState(String(initialReach));
  const [posts, setPosts] = useState(String(initialPostsPerChannel));
  const [submitting, setSubmitting] = useState(false);

  // Reset form mỗi lần mở dialog (đề phòng user mở-đóng-mở mà state stale).
  function onOpenChange(next: boolean) {
    if (next) {
      setFollow(String(initialFollowGrowth));
      setReach(String(initialReach));
      setPosts(String(initialPostsPerChannel));
    }
    setOpen(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // Parse + validate inputs trước khi POST. Empty string = 0 (clear goal).
    const parse = (s: string): number | null => {
      if (s.trim() === '') return 0;
      const n = parseInt(s.trim(), 10);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const f = parse(follow);
    const r = parse(reach);
    const p = parse(posts);
    if (f === null || r === null || p === null) {
      toast.error('Mỗi mục tiêu phải là số nguyên ≥ 0 (hoặc để trống = bỏ mục tiêu)');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/team-members/${memberId}/goals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalFollowGrowth30d: f,
          goalReach30d: r,
          goalPostsPerChannel30d: p,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Cập nhật thất bại');
        return;
      }
      toast.success(`Đã cập nhật mục tiêu cho ${memberName}`);
      setOpen(false);
      router.refresh(); // refetch server-side data → progress bars update
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'h-7 px-2 text-xs gap-1'
        )}
        title="Sửa mục tiêu 30 ngày"
      >
        <TargetIcon className="size-3" />
        Mục tiêu
      </DialogTrigger>

      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mục tiêu 30 ngày — {memberName}</DialogTitle>
          <p className="text-xs text-zinc-500 mt-1">
            Để trống hoặc nhập <code className="bg-zinc-100 px-1 rounded">0</code>{' '}
            = bỏ mục tiêu (không hiện progress bar).
          </p>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <GoalField
            id="goal-follow"
            label="Follow growth"
            hint="Tổng followers tăng thêm 30 ngày qua mọi kênh đang quản"
            unit="followers"
            value={follow}
            onChange={setFollow}
            placeholder="VD: 1000"
            disabled={submitting}
          />

          <GoalField
            id="goal-reach"
            label="Reach"
            hint="Tổng reach 30 ngày qua mọi kênh đang quản"
            unit="impressions"
            value={reach}
            onChange={setReach}
            placeholder="VD: 500000"
            disabled={submitting}
          />

          <GoalField
            id="goal-posts"
            label="Bài viết (tổng)"
            hint="TỔNG số bài đăng 30 ngày qua mọi kênh đang quản (không phải mỗi kênh)"
            unit="bài"
            value={posts}
            onChange={setPosts}
            placeholder="VD: 240"
            disabled={submitting}
          />

          <div className="flex justify-end gap-2 mt-2">
            <DialogClose render={<Button variant="outline" type="button" />}>
              Huỷ
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang lưu...' : 'Lưu mục tiêu'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GoalField({
  id,
  label,
  hint,
  unit,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div className="flex items-stretch gap-0 rounded-md border border-zinc-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 overflow-hidden">
        <Input
          id={id}
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="border-0 focus-visible:ring-0 focus-visible:border-0 rounded-none"
        />
        <span className="bg-zinc-50 border-l border-zinc-300 px-2.5 flex items-center text-xs text-zinc-600 whitespace-nowrap">
          {unit}
        </span>
      </div>
      <p className="text-[11px] text-zinc-500 leading-tight">{hint}</p>
    </div>
  );
}
