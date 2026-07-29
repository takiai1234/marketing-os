'use client';

// Client shell cho /skills/[id]/generate.
// Tạo ảnh qua 9Router (GPT Image 2) — đồng bộ, không polling.
// Layout 2-column: Left=form, Right=result + history

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ImageIcon,
  Loader2Icon,
  DownloadIcon,
  XCircleIcon,
  SendIcon,
  RefreshCwIcon,
} from 'lucide-react';
import type { GeneratedAsset } from '@/lib/queries/generated-asset';

interface Props {
  skillId: string;
  initialAssets: GeneratedAsset[];
}

const SIZES = [
  { value: '1024x1024', label: '1:1 (Vuông)' },
  { value: '1792x1024', label: '16:9 (Ngang)' },
  { value: '1024x1792', label: '9:16 (Dọc)' },
] as const;

type Size = (typeof SIZES)[number]['value'];

interface Result {
  assetId: string;
  url: string;
  prompt: string;
}

export function GenerateShell({ skillId, initialAssets }: Props) {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<Size>('1024x1024');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedAsset[]>(initialAssets);

  async function onGenerate() {
    if (prompt.trim().length < 3) { toast.error('Prompt quá ngắn'); return; }
    setGenerating(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/skills/${skillId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), size }),
      });
      const data = await res.json() as { url?: string; assetId?: string; error?: string };

      if (!res.ok || !data.url) {
        const msg = data.error ?? `HTTP ${res.status}`;
        setError(msg);
        toast.error(`Tạo ảnh thất bại: ${msg}`);
        return;
      }

      const r: Result = { assetId: data.assetId!, url: data.url, prompt: prompt.trim() };
      setResult(r);
      toast.success('Đã tạo ảnh');

      // Prepend vào history
      setHistory((prev) => {
        const asset: GeneratedAsset = {
          id: r.assetId,
          skillId,
          userId: '',
          assetType: 'image',
          model: 'gpt-image-2',
          prompt: r.prompt,
          inputParams: { size },
          taskId: null,
          status: 'success',
          resultUrl: r.url,
          rawResponse: null,
          errorMessage: null,
          costCredits: null,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        return [asset, ...prev.filter((a) => a.id !== r.assetId)].slice(0, 30);
      });
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error(`Lỗi: ${msg}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4 min-h-[calc(100vh-12rem)]">
      {/* ─── LEFT: Form ─────────────────────────────────────────── */}
      <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm flex flex-col">
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-2">
          <ImageIcon className="size-4 text-pink-600" />
          <span className="text-sm font-semibold text-zinc-800">Tạo ảnh</span>
          <span className="text-xs text-zinc-400 ml-auto">GPT Image 2 · 9Router</span>
        </div>

        <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
          {/* Prompt */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt" className="text-xs">Prompt</Label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder="A cinematic photo of a Vietnamese street food vendor at golden hour, shallow depth of field, 35mm lens..."
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
            <p className="text-[11px] text-zinc-400">
              Càng cụ thể càng tốt — mô tả chủ thể, ánh sáng, góc máy, phong cách.
            </p>
          </div>

          {/* Size */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Kích thước</Label>
            <div className="flex flex-wrap gap-1.5">
              {SIZES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSize(value)}
                  className={cn(
                    'px-3 py-1.5 rounded text-xs ring-1 transition',
                    size === value
                      ? 'bg-pink-50 text-pink-700 ring-pink-300'
                      : 'bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-400'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-zinc-100 bg-zinc-50/50 rounded-b-xl">
          <Button onClick={onGenerate} disabled={generating} className="w-full">
            {generating ? (
              <><Loader2Icon className="size-4 animate-spin" /> Đang tạo ảnh...</>
            ) : result ? (
              <><RefreshCwIcon className="size-4" /> Tạo lại</>
            ) : (
              <><SendIcon className="size-4" /> Tạo ảnh</>
            )}
          </Button>
        </div>
      </div>

      {/* ─── RIGHT: Result + History ────────────────────────────── */}
      <div className="flex flex-col gap-4 min-w-0">
        {/* Current result */}
        <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-4 min-h-[200px] flex flex-col justify-center">
          {generating ? (
            <div className="flex flex-col items-center gap-3 py-8 text-zinc-500">
              <Loader2Icon className="size-8 animate-spin text-pink-500" />
              <p className="text-sm">Đang tạo ảnh qua 9Router...</p>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3">
              <XCircleIcon className="size-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-800">{error}</p>
            </div>
          ) : result ? (
            <div className="flex flex-col gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.url}
                alt={result.prompt}
                className="w-full max-h-[60vh] object-contain rounded-lg ring-1 ring-zinc-200"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500 truncate">{result.prompt}</p>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-pink-600 hover:underline shrink-0"
                >
                  <DownloadIcon className="size-3.5" />
                  Tải về
                </a>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-zinc-400 py-8">
              Nhập prompt bên trái và nhấn <strong>Tạo ảnh</strong>.
            </p>
          )}
        </div>

        {/* History grid */}
        {history.length > 0 && (
          <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">
              Lịch sử ({history.length})
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {history.map((a) => (
                <HistoryItem key={a.id} asset={a} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryItem({ asset }: { asset: GeneratedAsset }) {
  if (asset.status === 'success' && asset.resultUrl) {
    return (
      <a
        href={asset.resultUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block aspect-square overflow-hidden rounded-lg ring-1 ring-zinc-200 hover:ring-pink-300"
        title={asset.prompt}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.resultUrl} alt={asset.prompt} className="w-full h-full object-cover" />
      </a>
    );
  }
  return (
    <div
      className={cn(
        'aspect-square rounded-lg ring-1 flex items-center justify-center',
        asset.status === 'failed' ? 'ring-rose-200 bg-rose-50' : 'ring-zinc-200 bg-zinc-50'
      )}
    >
      <XCircleIcon className="size-5 text-rose-400" />
    </div>
  );
}
