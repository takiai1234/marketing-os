'use client';

// Shared chat input row với:
//   - Textarea text input
//   - Nút paperclip mở file picker (multiple)
//   - Drag-drop overlay
//   - Preview strip cho file đã chọn (thumbnail cho image, pill cho file)
//   - Send button
//
// Dùng cho cả project chat + skill chat. State managed nội bộ — caller
// chỉ provide onSubmit({content, files}) callback.

import {
  useState,
  useRef,
  DragEvent,
  FormEvent,
  ChangeEvent,
  useEffect,
} from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  PaperclipIcon,
  SendIcon,
  XIcon,
  FileIcon,
  ImageIcon,
} from 'lucide-react';

export interface AttachmentInputSubmit {
  content: string;
  files: File[];
}

interface Props {
  placeholder: string;
  disabled?: boolean;
  onSubmit: (data: AttachmentInputSubmit) => void | Promise<void>;
  /** Max files cho phép — mặc định 8 */
  maxFiles?: number;
}

interface FilePreview {
  file: File;
  /** Object URL cho image preview (revoke khi unmount/remove) */
  previewUrl: string | null;
}

export function AttachmentInput({
  placeholder,
  disabled = false,
  onSubmit,
  maxFiles = 8,
}: Props) {
  const [text, setText] = useState('');
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Cleanup object URLs khi unmount/remove
  useEffect(() => {
    return () => {
      previews.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(fileList: FileList | File[]) {
    const newFiles: FilePreview[] = [];
    for (const f of Array.from(fileList)) {
      // Skip duplicates (filename + size)
      const exists = previews.some(
        (p) => p.file.name === f.name && p.file.size === f.size
      );
      if (exists) continue;
      const isImage = f.type.startsWith('image/');
      newFiles.push({
        file: f,
        previewUrl: isImage ? URL.createObjectURL(f) : null,
      });
    }
    setPreviews((prev) => {
      const combined = [...prev, ...newFiles];
      if (combined.length > maxFiles) {
        // Revoke ObjectURLs vừa tạo cho file thừa
        combined.slice(maxFiles).forEach((p) => {
          if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
        });
        return combined.slice(0, maxFiles);
      }
      return combined;
    });
  }

  function removeFile(idx: number) {
    setPreviews((prev) => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = ''; // reset để re-pick cùng file được
    }
  }

  function handleDragOver(e: DragEvent<HTMLFormElement>) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLFormElement>) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    const trimmedText = text.trim();
    if (!trimmedText && previews.length === 0) return;

    await onSubmit({ content: trimmedText, files: previews.map((p) => p.file) });

    // Reset
    previews.forEach((p) => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    });
    setText('');
    setPreviews([]);
  }

  const canSubmit = !disabled && (text.trim().length > 0 || previews.length > 0);

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'relative p-3 border-t border-zinc-100 flex flex-col gap-2',
        dragOver && 'ring-2 ring-blue-400 bg-blue-50/40'
      )}
    >
      {/* Drag-drop overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-blue-50/70 backdrop-blur-sm rounded-md">
          <div className="text-sm font-semibold text-blue-700 flex items-center gap-2">
            <PaperclipIcon className="size-5" />
            Thả file vào đây để đính kèm
          </div>
        </div>
      )}

      {/* Preview strip */}
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((p, idx) => (
            <PreviewChip
              key={`${p.file.name}-${idx}`}
              preview={p}
              onRemove={() => removeFile(idx)}
            />
          ))}
          {previews.length < maxFiles && (
            <p className="text-[11px] text-zinc-400 self-end pb-1">
              {previews.length}/{maxFiles} file
            </p>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || previews.length >= maxFiles}
          className="self-end shrink-0 p-2 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Đính kèm file hoặc ảnh"
        >
          <PaperclipIcon className="size-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit(e as unknown as FormEvent);
            }
          }}
          placeholder={placeholder}
          rows={3}
          disabled={disabled}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 min-h-[60px] max-h-[200px]"
        />

        <Button
          type="submit"
          disabled={!canSubmit}
          className="self-end shrink-0"
        >
          <SendIcon className="size-4" />
          Gửi
        </Button>
      </div>
    </form>
  );
}

// ─── Preview chip ─────────────────────────────────────────────────────────

function PreviewChip({
  preview,
  onRemove,
}: {
  preview: FilePreview;
  onRemove: () => void;
}) {
  const isImage = preview.previewUrl !== null;

  if (isImage) {
    return (
      <div className="relative size-16 rounded-md overflow-hidden ring-1 ring-zinc-200 group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview.previewUrl!}
          alt={preview.file.name}
          className="w-full h-full object-cover"
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 opacity-80 group-hover:opacity-100"
          title="Xoá"
        >
          <XIcon className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 max-w-[200px] px-2 py-1.5 rounded-md bg-zinc-100 ring-1 ring-zinc-200 group">
      <FileIcon className="size-3.5 shrink-0 text-zinc-500" />
      <span className="text-xs text-zinc-700 truncate" title={preview.file.name}>
        {preview.file.name}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="text-zinc-400 hover:text-rose-600 ml-1 shrink-0"
        title="Xoá"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

// Re-export ImageIcon for callers if needed
export { ImageIcon };
