'use client';

// Project detail — 2 col layout:
//   Left  : Custom instructions (textarea + auto-save debounce)
//   Right : File manager (drag-drop upload + list + delete)
//
// Auto-save: debounce 1.5s sau khi user ngừng gõ → PATCH /api/projects/[id]

import { useState, useEffect, useRef, useCallback, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Trash2Icon,
  UploadCloudIcon,
  FileTextIcon,
  FileIcon,
  Loader2Icon,
  AlertCircleIcon,
  CheckIcon,
} from 'lucide-react';
import type { Project, ProjectFile } from '@/lib/queries/projects';
import { useCanEdit } from '@/components/auth/role-provider';

interface Props {
  initialProject: Project;
  initialFiles: ProjectFile[];
}

const SAVE_DEBOUNCE_MS = 1500;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectDetailShell({ initialProject, initialFiles }: Props) {
  const router = useRouter();
  const [instructions, setInstructions] = useState(initialProject.instructions);
  const [files, setFiles] = useState(initialFiles);
  const [savedState, setSavedState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canEdit = useCanEdit();
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save instructions
  useEffect(() => {
    if (instructions === initialProject.instructions) {
      setSavedState('idle');
      return;
    }
    setSavedState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${initialProject.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instructions }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setSavedState('saved');
        setTimeout(() => setSavedState('idle'), 2000);
      } catch (err) {
        setSavedState('error');
        toast.error(`Lưu thất bại: ${(err as Error).message}`);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [instructions, initialProject.instructions, initialProject.id]);

  // ─── File upload ───────────────────────────────────────────────────────
  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/projects/${initialProject.id}/files`, {
          method: 'POST',
          body: fd,
        });
        const data = (await res.json().catch(() => ({}))) as {
          file?: ProjectFile;
          error?: string;
          isBinaryUnsupported?: boolean;
          truncated?: boolean;
          pageCount?: number;
        };
        if (!res.ok || !data.file) {
          toast.error(data.error ?? `Upload thất bại (${res.status})`);
          return;
        }
        // Replace nếu cùng filename (upsert), else add
        setFiles((prev) => {
          const filtered = prev.filter((f) => f.filename !== data.file!.filename);
          return [data.file!, ...filtered];
        });
        if (data.isBinaryUnsupported) {
          toast.warning(
            `Đã lưu "${file.name}" nhưng không extract được text — chat sẽ không thấy nội dung file này.`
          );
        } else if (data.truncated) {
          toast.warning(`Upload "${file.name}" — text bị cắt vì quá dài.`);
        } else {
          toast.success(
            `Đã upload ${file.name}${data.pageCount ? ` (${data.pageCount} trang)` : ''}`
          );
        }
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [initialProject.id]
  );

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      // Upload tuần tự để tránh nổ server với 10 file PDF cùng lúc
      for (const f of Array.from(fileList)) {
        await uploadFile(f);
      }
      router.refresh();
    },
    [uploadFile, router]
  );

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files);
    }
  }

  async function onDeleteFile(fileId: string) {
    if (!confirm('Xoá file này? Chat sẽ không còn truy cập được nội dung.')) return;
    setDeletingId(fileId);
    try {
      const res = await fetch(
        `/api/projects/${initialProject.id}/files/${fileId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? 'Xoá thất bại');
        return;
      }
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success('Đã xoá file');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  async function onDeleteProject() {
    if (!deleteProjectConfirm) {
      setDeleteProjectConfirm(true);
      setTimeout(() => setDeleteProjectConfirm(false), 5000);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${initialProject.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.error('Xoá project thất bại');
        return;
      }
      toast.success('Đã xoá project');
      router.push('/projects');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      {/* ─── LEFT: Instructions ─── */}
      <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="instructions" className="text-sm font-semibold">
            Custom instructions
          </Label>
          <div className="text-xs">
            {savedState === 'saving' && (
              <span className="text-zinc-500 inline-flex items-center gap-1">
                <Loader2Icon className="size-3 animate-spin" />
                Đang lưu...
              </span>
            )}
            {savedState === 'saved' && (
              <span className="text-emerald-600 inline-flex items-center gap-1">
                <CheckIcon className="size-3.5" />
                Đã lưu
              </span>
            )}
            {savedState === 'error' && (
              <span className="text-rose-600 inline-flex items-center gap-1">
                <AlertCircleIcon className="size-3.5" />
                Lỗi lưu
              </span>
            )}
            {savedState === 'idle' && (
              <span className="text-zinc-400">Tự động lưu sau 1.5s</span>
            )}
          </div>
        </div>

        <textarea
          id="instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          readOnly={!canEdit}
          rows={20}
          maxLength={50_000}
          placeholder="Custom instructions cho mọi chat trong project này..."
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono leading-relaxed resize-y min-h-[400px] focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        <p className="text-[11px] text-zinc-500">
          {instructions.length.toLocaleString()} / 50,000 ký tự. Sẽ được dùng
          làm system prompt cho mọi chat session trong project.
        </p>

        {canEdit && (
          <div className="border-t border-zinc-100 pt-3 mt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDeleteProject}
              className={cn(
                'text-rose-600 hover:text-rose-700 hover:bg-rose-50',
                deleteProjectConfirm && 'bg-rose-50 ring-1 ring-rose-300'
              )}
            >
              <Trash2Icon className="size-3.5" />
              {deleteProjectConfirm
                ? 'Click lần nữa để xoá hẳn project (cascade tất cả file + chat)'
                : 'Xoá project'}
            </Button>
          </div>
        )}
      </div>

      {/* ─── RIGHT: File manager ─── */}
      <div className="flex flex-col gap-4">
        {canEdit && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'rounded-xl border-2 border-dashed cursor-pointer transition px-4 py-8 text-center',
              dragOver
                ? 'border-violet-400 bg-violet-50'
                : 'border-zinc-300 bg-zinc-50/30 hover:border-violet-300 hover:bg-violet-50/30'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                  await uploadFiles(e.target.files);
                  e.target.value = '';
                }
              }}
              disabled={uploading}
            />
            {uploading ? (
              <div className="text-sm text-zinc-600">
                <Loader2Icon className="size-6 mx-auto mb-2 animate-spin text-violet-600" />
                Đang upload + parse...
              </div>
            ) : (
              <div className="text-sm text-zinc-600">
                <UploadCloudIcon className="size-7 mx-auto mb-2 text-violet-500" />
                <div className="font-medium">Kéo file vào đây hoặc click chọn</div>
                <p className="text-xs text-zinc-500 mt-1">
                  PDF, DOCX, MD, TXT, JSON, CSV, code... (max 20 MB/file)
                </p>
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-sm font-semibold text-zinc-900">
              Knowledge files ({files.length})
            </h3>
          </div>

          {files.length === 0 ? (
            <p className="text-xs text-zinc-500 italic px-1 py-3">
              Chưa có file nào. Upload PDF/DOCX/MD để chat có context.
            </p>
          ) : (
            <div className="flex flex-col gap-1 max-h-[600px] overflow-y-auto">
              {files.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  onDelete={() => onDeleteFile(f.id)}
                  isDeleting={deletingId === f.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function FileRow({
  file,
  onDelete,
  isDeleting,
}: {
  file: ProjectFile;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const canEdit = useCanEdit();
  const hasText = file.contentText.length > 0;
  return (
    <div className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-50">
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded',
          hasText
            ? 'bg-violet-50 text-violet-600'
            : 'bg-amber-50 text-amber-700'
        )}
      >
        {hasText ? (
          <FileTextIcon className="size-3.5" />
        ) : (
          <FileIcon className="size-3.5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-900 truncate">
          {file.filename}
        </p>
        <p className="text-[10px] text-zinc-500">
          {formatBytes(file.sizeBytes)}
          {hasText && ` · ${(file.contentText.length / 1000).toFixed(0)}K chars`}
          {!hasText && ' · (binary, no text)'}
        </p>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="opacity-0 group-hover:opacity-100 transition text-zinc-400 hover:text-rose-600 p-1"
          title="Xoá"
        >
          {isDeleting ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <Trash2Icon className="size-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
