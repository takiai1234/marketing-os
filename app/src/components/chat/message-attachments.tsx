'use client';

// Render attachments trong message bubble (user message).
// Image → thumbnail clickable mở full size.
// File → pill với filename + icon.

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FileIcon, XIcon, FileTextIcon } from 'lucide-react';

export interface UiAttachment {
  id: string;
  kind: 'image' | 'file';
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isBinaryUnsupported: boolean;
  pageCount: number | null;
}

interface Props {
  messageId: string;
  attachments: UiAttachment[];
  /** isUserBubble → text-white style cho file pill, ngược lại text-zinc */
  invertColors?: boolean;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MessageAttachments({
  messageId,
  attachments,
  invertColors,
}: Props) {
  const [lightbox, setLightbox] = useState<UiAttachment | null>(null);
  if (attachments.length === 0) return null;

  // Skip temp messages có id chưa save (vd "temp-user-...") — URL chưa có
  const isTempMessage = messageId.startsWith('temp-');

  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind === 'file');

  return (
    <>
      {images.length > 0 && (
        <div
          className={cn(
            'mt-2 grid gap-1.5',
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          )}
        >
          {images.map((a) => {
            const url = isTempMessage
              ? null
              : `/api/chat-attachments/${messageId}/${a.id}`;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => url && setLightbox(a)}
                className="block rounded-md overflow-hidden ring-1 ring-zinc-300/40 hover:ring-zinc-400 transition relative"
                disabled={!url}
                title={a.filename}
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={a.filename}
                    className="w-full max-h-64 object-cover"
                  />
                ) : (
                  <div className="w-full h-32 bg-zinc-200 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {files.map((a) => {
            const url = isTempMessage
              ? null
              : `/api/chat-attachments/${messageId}/${a.id}`;
            return (
              <a
                key={a.id}
                href={url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-1 rounded-md ring-1 max-w-[260px]',
                  invertColors
                    ? 'bg-white/15 ring-white/20 text-white hover:bg-white/25'
                    : 'bg-zinc-50 ring-zinc-200 text-zinc-700 hover:bg-zinc-100',
                  !url && 'opacity-60 pointer-events-none'
                )}
                title={a.filename}
              >
                {a.isBinaryUnsupported ? (
                  <FileIcon className="size-3.5 shrink-0" />
                ) : (
                  <FileTextIcon className="size-3.5 shrink-0" />
                )}
                <span className="text-xs truncate">{a.filename}</span>
                <span
                  className={cn(
                    'text-[10px] shrink-0',
                    invertColors ? 'opacity-80' : 'text-zinc-500'
                  )}
                >
                  {formatBytes(a.sizeBytes)}
                  {a.pageCount ? ` · ${a.pageCount}p` : ''}
                </span>
              </a>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/chat-attachments/${messageId}/${lightbox.id}`}
            alt={lightbox.filename}
            className="max-w-full max-h-full object-contain rounded-md"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white bg-black/60 hover:bg-black/80 rounded-full p-2"
          >
            <XIcon className="size-5" />
          </button>
        </div>
      )}
    </>
  );
}
