'use client';

// Dialog "Viết lại bài viết tương tự".
//
// Props: source data (đã có ở client từ card). User chọn tone/platform/
// length/model + optional custom instructions → POST /api/rewrite → hiển
// thị kết quả với Copy + Regenerate buttons.

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  SparklesIcon,
  CopyIcon,
  RefreshCwIcon,
  CheckIcon,
  Loader2Icon,
} from 'lucide-react';
import {
  TONE_OPTIONS,
  PLATFORM_OPTIONS,
  LENGTH_OPTIONS,
  type RewriteSourceType,
  type RewriteTone,
  type RewritePlatform,
  type RewriteLength,
} from '@/lib/rewrite/build-prompt';
import { AVAILABLE_MODELS } from '@/lib/llm/openrouter-models';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceType: RewriteSourceType;
  sourceTitle: string | null;
  sourceContent: string;
  sourceContext: string | null;
  sourcePlatform: string | null;
}

const DEFAULT_MODEL = '~anthropic/claude-sonnet-latest';

function smartDefaultPlatform(
  sourceType: RewriteSourceType,
  sourcePlatform: string | null
): RewritePlatform {
  // Library post: thường target lại cùng platform
  if (sourceType === 'library_post' && sourcePlatform) {
    if (sourcePlatform === 'facebook') return 'facebook_post';
    if (sourcePlatform === 'instagram') return 'instagram';
    if (sourcePlatform === 'tiktok') return 'tiktok';
    if (sourcePlatform === 'threads') return 'threads';
  }
  // News article: thường convert thành caption Facebook
  return 'facebook_post';
}

export function RewriteDialog({
  open,
  onOpenChange,
  sourceType,
  sourceTitle,
  sourceContent,
  sourceContext,
  sourcePlatform,
}: Props) {
  const [tone, setTone] = useState<RewriteTone>('friendly');
  const [platform, setPlatform] = useState<RewritePlatform>(() =>
    smartDefaultPlatform(sourceType, sourcePlatform)
  );
  const [length, setLength] = useState<RewriteLength>('medium');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [customInstructions, setCustomInstructions] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [usage, setUsage] = useState<{ tokensIn: number; tokensOut: number } | null>(null);

  // Reset form khi đóng dialog
  useEffect(() => {
    if (!open) {
      setResult('');
      setUsage(null);
      setCopied(false);
    }
  }, [open]);

  async function onGenerate() {
    setGenerating(true);
    setResult('');
    setUsage(null);
    setCopied(false);
    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          sourceContent,
          sourceContext,
          sourcePlatform,
          model,
          tone,
          platform,
          length,
          customInstructions,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg = '';
        try {
          const data = JSON.parse(text) as { error?: string };
          if (data.error) errMsg = data.error;
        } catch {
          errMsg = text.slice(0, 200).replace(/<[^>]+>/g, '').trim();
        }
        if (!errMsg) errMsg = `HTTP ${res.status} ${res.statusText || ''}`.trim();
        toast.error(`Tạo nội dung thất bại: ${errMsg}`);
        return;
      }

      const data = (await res.json()) as {
        content: string;
        tokensIn: number;
        tokensOut: number;
        model: string;
      };
      setResult(data.content);
      setUsage({ tokensIn: data.tokensIn, tokensOut: data.tokensOut });
      toast.success('Đã tạo nội dung mới');
    } catch (err) {
      toast.error(`Lỗi kết nối: ${(err as Error).message}`);
    } finally {
      setGenerating(false);
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      toast.success('Đã copy vào clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Không copy được — chọn text và Ctrl+C');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(90vw,1100px)] max-h-[92vh] flex flex-col w-full sm:w-[min(90vw,1100px)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-5 text-violet-600" />
            Viết lại bài viết tương tự
          </DialogTitle>
          <DialogDescription>
            AI giữ chủ đề + thông điệp, đổi cách diễn đạt theo tone + định
            dạng bạn chọn.
          </DialogDescription>
        </DialogHeader>

        {/* Body — 2 col grid khi có result, else single col */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0">
        <div className={cn(
          'grid gap-5',
          result ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
        )}>
          {/* LEFT: Source + Form */}
          <div className="flex flex-col gap-4 min-w-0">
            {/* Source preview */}
            <div className="rounded-md border border-zinc-200 bg-zinc-50/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
                {sourceType === 'news' ? 'Tin tức gốc' : 'Bài đăng gốc'}
                {sourceContext && <span className="normal-case"> · {sourceContext}</span>}
              </div>
              {sourceTitle && (
                <p className="text-sm font-semibold text-zinc-900 mb-0.5">
                  {sourceTitle}
                </p>
              )}
              <p className="text-xs text-zinc-700 line-clamp-6 leading-relaxed">
                {sourceContent}
              </p>
            </div>

          {/* Form */}
          <div className="grid grid-cols-2 gap-3">
            {/* Tone */}
            <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
              <Label className="text-xs">Tone</Label>
              <div className="flex flex-wrap gap-1.5">
                {TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTone(opt.value)}
                    title={opt.hint}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs ring-1 transition',
                      tone === opt.value
                        ? 'bg-violet-50 text-violet-700 ring-violet-300'
                        : 'bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-400'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Length */}
            <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-1">
              <Label className="text-xs">Độ dài</Label>
              <div className="flex flex-wrap gap-1.5">
                {LENGTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLength(opt.value)}
                    title={opt.hint}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs ring-1 transition',
                      length === opt.value
                        ? 'bg-pink-50 text-pink-700 ring-pink-300'
                        : 'bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-400'
                    )}
                  >
                    {opt.label}
                    <span className="text-[10px] text-zinc-400 ml-1">({opt.hint})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Platform target */}
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label htmlFor="platform" className="text-xs">
                Định dạng đầu ra
              </Label>
              <select
                id="platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as RewritePlatform)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
              >
                {PLATFORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Model */}
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label htmlFor="model" className="text-xs">
                Model AI
              </Label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom instructions */}
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label htmlFor="custom" className="text-xs">
                Yêu cầu riêng (optional)
              </Label>
              <textarea
                id="custom"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Vd: Bài cho ngành ẩm thực Việt Nam, target chị em 25-40 tuổi, có CTA mua khoá học cuối bài"
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs resize-y focus:outline-none focus:ring-2 focus:ring-violet-200"
              />
            </div>
          </div>
          </div>
          {/* /LEFT */}

          {/* RIGHT: Result */}
          {result && (
            <div className="flex flex-col gap-2 min-w-0">
              <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-4 py-4 space-y-3 flex-1">
                <div className="flex items-center justify-between gap-2 border-b border-emerald-200 pb-2">
                  <span className="text-xs uppercase tracking-wide font-semibold text-emerald-700 flex items-center gap-1">
                    <SparklesIcon className="size-3.5" />
                    Nội dung mới
                  </span>
                  {usage && (
                    <span className="text-[10px] text-zinc-500 tabular-nums">
                      {usage.tokensIn} in · {usage.tokensOut} out
                    </span>
                  )}
                </div>
                <p className="text-sm text-zinc-900 whitespace-pre-wrap leading-relaxed">
                  {result}
                </p>
              </div>
            </div>
          )}
        </div>
        </div>

        <DialogFooter className="flex-row flex-wrap gap-2 sm:gap-3 items-center justify-end pt-3 border-t border-zinc-100">
          {result && (
            <>
              <Button variant="outline" size="sm" onClick={onCopy} disabled={copied}>
                {copied ? (
                  <>
                    <CheckIcon className="size-3.5" />
                    Đã copy
                  </>
                ) : (
                  <>
                    <CopyIcon className="size-3.5" />
                    Sao chép
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerate}
                disabled={generating}
              >
                <RefreshCwIcon className={cn('size-3.5', generating && 'animate-spin')} />
                Tạo lại
              </Button>
            </>
          )}
          <Button onClick={onGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Đang viết...
              </>
            ) : (
              <>
                <SparklesIcon className="size-4" />
                {result ? 'Tạo phiên bản khác' : 'Tạo nội dung'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
