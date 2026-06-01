'use client';

// ChannelMembersEditor — multi-member management cho 1 kênh.
//
// Quy tắc:
//   - Rule A: 1 primary + N editor (UI block "Make primary" nếu đã có primary,
//     gợi ý "swap" thay vì tạo 2 primary)
//   - B2: editor visible với badge ‧ EDITOR ở team-member-card tags
//
// Hai mode:
//   - Display (mọi user): chips inline showing current members + role badges
//   - Edit (admin): bấm "Sửa thành viên" → dialog với full editor (add/remove/
//     toggle role). Save → PUT /api/channels/[id]/members → router.refresh.

import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { UsersIcon, TrashIcon, PlusIcon, CrownIcon, EditIcon } from 'lucide-react';

export type MemberRole = 'primary' | 'editor';

export interface ChannelMember {
  memberId: string;
  name: string;
  email: string;
  teamRole: string;
  role: MemberRole;
}

export interface MemberOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Props {
  accountId: string;
  /** Current members (already sorted primary-first ở server). */
  initialMembers: ChannelMember[];
  /** Full team pool — admin chọn từ đây để add. Empty cho non-admin. */
  allTeamMembers: MemberOption[];
  /** Non-admin: chỉ thấy display, không thấy nút Sửa. */
  isAdmin: boolean;
}

export function ChannelMembersEditor({
  accountId,
  initialMembers,
  allTeamMembers,
  isAdmin,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Display: chips inline */}
      {initialMembers.length === 0 ? (
        <span className="text-sm italic text-zinc-400">Chưa gán</span>
      ) : (
        initialMembers.map((m) => <MemberChip key={m.memberId} member={m} />)
      )}

      {/* Admin edit button — opens full editor dialog */}
      {isAdmin && (
        <EditMembersDialog
          accountId={accountId}
          initialMembers={initialMembers}
          allTeamMembers={allTeamMembers}
        />
      )}
    </div>
  );
}

// ─── Display chip ──────────────────────────────────────────────────────────

function MemberChip({ member }: { member: ChannelMember }) {
  const isPrimary = member.role === 'primary';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1',
        isPrimary
          ? 'bg-blue-50 text-blue-800 ring-blue-200'
          : 'bg-zinc-50 text-zinc-600 ring-zinc-200'
      )}
      title={isPrimary ? `${member.name} · primary (100% KPI)` : `${member.name} · editor (0 KPI, hỗ trợ)`}
    >
      {isPrimary && <CrownIcon className="size-3 text-blue-600 shrink-0" />}
      <span>{member.name}</span>
      {!isPrimary && (
        <span className="text-[10px] text-zinc-400 uppercase tracking-wide">
          editor
        </span>
      )}
    </span>
  );
}

// ─── Edit dialog (admin only) ──────────────────────────────────────────────

function EditMembersDialog({
  accountId,
  initialMembers,
  allTeamMembers,
}: Pick<Props, 'accountId' | 'initialMembers' | 'allTeamMembers'>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Local working state — reset mỗi lần mở dialog (đề phòng user mở-đóng-mở).
  const [working, setWorking] = useState<ChannelMember[]>(initialMembers);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) setWorking(initialMembers);
    setOpen(next);
  }

  // Add 1 member mới (default editor — admin có thể promote sau).
  function addMember(opt: MemberOption) {
    if (working.some((m) => m.memberId === opt.id)) {
      toast.warning(`${opt.name} đã trong danh sách`);
      return;
    }
    setWorking((prev) => [
      ...prev,
      {
        memberId: opt.id,
        name: opt.name,
        email: opt.email,
        teamRole: opt.role,
        role: 'editor',
      },
    ]);
    setAddPickerOpen(false);
  }

  function removeMember(memberId: string) {
    setWorking((prev) => prev.filter((m) => m.memberId !== memberId));
  }

  // "Make primary" — swap với primary hiện tại (Rule A: max 1 primary).
  // Primary cũ tự động xuống editor.
  function makePrimary(memberId: string) {
    setWorking((prev) =>
      prev.map((m) => {
        if (m.memberId === memberId) return { ...m, role: 'primary' };
        if (m.role === 'primary') return { ...m, role: 'editor' };
        return m;
      })
    );
  }

  function makeEditor(memberId: string) {
    setWorking((prev) =>
      prev.map((m) =>
        m.memberId === memberId ? { ...m, role: 'editor' } : m
      )
    );
  }

  async function onSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/channels/${accountId}/members`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: working.map((m) => ({ memberId: m.memberId, role: m.role })),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Lưu thất bại');
        return;
      }
      toast.success('Đã cập nhật thành viên kênh');
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Pool to add: team members NOT yet in working list
  const availableToAdd = allTeamMembers.filter(
    (tm) => !working.some((w) => w.memberId === tm.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'h-7 px-2 text-xs gap-1'
        )}
      >
        <EditIcon className="size-3" />
        Sửa thành viên
      </DialogTrigger>

      <DialogContent className="w-full sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="size-4 text-blue-600" />
            Sửa thành viên kênh
          </DialogTitle>
          <p className="text-xs text-zinc-500 mt-1 space-y-0.5">
            <span className="block">
              <span className="font-semibold text-blue-700">Primary</span>:
              được tính 100% KPI cho kênh này (max 1 / kênh)
            </span>
            <span className="block">
              <span className="font-semibold text-zinc-600">Editor</span>:
              0 KPI nhưng vẫn hiện trong "kênh đang quản" của member
            </span>
          </p>
        </DialogHeader>

        {/* Current members list */}
        <ul className="flex flex-col gap-1.5">
          {working.length === 0 && (
            <li className="text-xs text-zinc-400 italic py-2 text-center">
              Chưa có thành viên nào
            </li>
          )}
          {working.map((m) => (
            <li
              key={m.memberId}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md border px-3 py-2',
                m.role === 'primary'
                  ? 'border-blue-200 bg-blue-50/40'
                  : 'border-zinc-200 bg-white'
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {m.role === 'primary' && (
                  <CrownIcon className="size-3.5 text-blue-600 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {m.name}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate">{m.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {m.role === 'primary' ? (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700 px-1.5">
                    PRIMARY
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => makePrimary(m.memberId)}
                    title="Đặt làm primary — primary hiện tại sẽ thành editor"
                  >
                    <CrownIcon className="size-3 mr-1" />
                    Make primary
                  </Button>
                )}
                {m.role === 'primary' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => makeEditor(m.memberId)}
                    title="Hạ xuống editor — kênh sẽ không có primary nữa"
                  >
                    Hạ xuống editor
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-zinc-400 hover:text-rose-600"
                  onClick={() => removeMember(m.memberId)}
                  title="Xoá khỏi kênh"
                >
                  <TrashIcon className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {/* Add picker */}
        {availableToAdd.length > 0 ? (
          <div className="flex items-center gap-2">
            {!addPickerOpen ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddPickerOpen(true)}
                className="text-xs"
              >
                <PlusIcon className="size-3.5 mr-1" />
                Thêm thành viên
              </Button>
            ) : (
              <Select
                value=""
                onValueChange={(v: string | null) => {
                  if (!v) return;
                  const opt = availableToAdd.find((m) => m.id === v);
                  if (opt) addMember(opt);
                }}
              >
                <SelectTrigger className="h-8 flex-1" size="sm">
                  <SelectValue placeholder="Chọn member để thêm..." />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}{' '}
                      <span className="text-xs text-zinc-400 ml-1">
                        · {m.role}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ) : (
          <p className="text-[11px] italic text-zinc-400">
            Đã add hết team. Tạo member mới ở trang /team trước.
          </p>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-2 mt-2 border-t pt-3">
          <DialogClose render={<Button variant="outline" type="button" />}>
            Huỷ
          </DialogClose>
          <Button onClick={onSave} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
