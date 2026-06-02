'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Bộ màu preset — user click để chọn, không cần color picker phức tạp
const COLOR_PRESETS = [
  { name: 'Violet', hex: '8b5cf6' },
  { name: 'Pink', hex: 'ec4899' },
  { name: 'Blue', hex: '3b82f6' },
  { name: 'Emerald', hex: '10b981' },
  { name: 'Amber', hex: 'f59e0b' },
  { name: 'Rose', hex: 'f43f5e' },
  { name: 'Slate', hex: '64748b' },
];

const ICON_PRESETS = ['📁', '📊', '🎨', '📝', '💼', '🚀', '🧠', '⚙️', '📚', '🔬'];

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [icon, setIcon] = useState<string | null>('📁');
  const [colorHex, setColorHex] = useState<string | null>('8b5cf6');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Đặt tên project trước');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          instructions,
          icon,
          colorHex,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        project?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.project) {
        toast.error(data.error ?? 'Tạo project thất bại');
        return;
      }
      toast.success('Đã tạo project. Mở để upload file.');
      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-5 flex flex-col gap-4"
    >
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name" className="text-sm">
          Tên project <span className="text-rose-500">*</span>
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Vd: Content marketing TET 2026"
          maxLength={200}
          disabled={saving}
          autoFocus
        />
      </div>

      {/* Icon + color */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm">Icon</Label>
          <div className="flex flex-wrap gap-1.5">
            {ICON_PRESETS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={cn(
                  'size-9 rounded-lg text-lg flex items-center justify-center ring-1 transition',
                  icon === emoji
                    ? 'ring-violet-400 bg-violet-50'
                    : 'ring-zinc-200 hover:ring-zinc-400 bg-white'
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-sm">Màu</Label>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColorHex(c.hex)}
                title={c.name}
                className={cn(
                  'size-9 rounded-lg transition ring-2',
                  colorHex === c.hex
                    ? 'ring-zinc-900 scale-95'
                    : 'ring-transparent hover:ring-zinc-300'
                )}
                style={{ backgroundColor: `#${c.hex}` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="instructions" className="text-sm">
          Custom instructions
        </Label>
        <textarea
          id="instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={10}
          maxLength={50_000}
          placeholder={`Vd:\n\nBạn là chuyên gia content marketing cho ngành ẩm thực Việt Nam.\nViết theo phong cách thân mật, dùng tiếng Việt có dấu, không dịch máy.\nMỗi bài đều có:\n- Hook 1 câu\n- 3 ý chính, mỗi ý 2-3 dòng\n- CTA rõ ràng`}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-violet-200"
          disabled={saving}
        />
        <p className="text-[11px] text-zinc-500">
          Đây là system prompt mặc định cho mọi chat trong project. Có thể
          sửa sau ở trang chi tiết.
        </p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
        <p className="text-xs text-zinc-500">
          {instructions.length.toLocaleString()} / 50,000 ký tự
        </p>
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Đang tạo...' : 'Tạo project'}
        </Button>
      </div>
    </form>
  );
}
