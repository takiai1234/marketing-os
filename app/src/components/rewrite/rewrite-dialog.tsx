'use client';

// Dialog "Viết lại bài viết tương tự".
//
// Props: source data (đã có ở client từ card). User chọn tone/platform/
// length/model + optional custom instructions → POST /api/rewrite → hiển
// thị kết quả với Copy + Regenerate buttons.

import { useState, useEffect, useRef } from 'react';
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
  BrainCircuitIcon,
  ImageIcon,
  DownloadIcon,
  ChevronDownIcon,
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

const DEFAULT_MODEL = 'cc/claude-sonnet-4-5-20250929';

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
  const [skillId, setSkillId] = useState<string | null>(null);
  const [skills, setSkills] = useState<{ id: string; name: string }[] | null>(null);
  const skillsFetched = useRef(false);

  // ── Image generation state ──────────────────────────────────────────────
  const [imgExpanded, setImgExpanded] = useState(false);
  const [imgSize, setImgSize] = useState<'1024x1024' | '1792x1024' | '1024x1792'>('1024x1024');
  const [imgPrompt, setImgPrompt] = useState('');
  const [imgGenerating, setImgGenerating] = useState(false);
  const [imgResultUrl, setImgResultUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  // Reset form khi đóng dialog
  useEffect(() => {
    if (!open) {
      setResult('');
      setUsage(null);
      setCopied(false);
      setImgExpanded(false);
      setImgResultUrl(null);
      setImgError(null);
      setImgGenerating(false);
      setImgPrompt('');
    }
  }, [open]);

  // Lazy-load skills khi dialog mở lần đầu
  useEffect(() => {
    if (open && !skillsFetched.current) {
      skillsFetched.current = true;
      fetch('/api/skills')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { items?: { id: string; name: string }[] } | null) => {
          if (data?.items) setSkills(data.items);
        })
        .catch(() => {});
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
          ...(skillId ? { skillId } : {}),
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

  async function onGenerateImage() {
    if (!imgPrompt.trim()) { toast.error('Nhập prompt cho ảnh trước'); return; }
    setImgGenerating(true);
    setImgResultUrl(null);
    setImgError(null);
    try {
      const res = await fetch('/api/rewrite/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imgPrompt, size: imgSize }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        const msg = data.error ?? `HTTP ${res.status}`;
        setImgError(msg);
        toast.error(`Tạo ảnh thất bại: ${msg}`);
        return;
      }
      setImgResultUrl(data.url);
      toast.success('Đã tạo ảnh');
    } catch (err) {
      const msg = (err as Error).message;
      setImgError(msg);
      toast.error(`Lỗi: ${msg}`);
    } finally {
      setImgGenerating(false);
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

            {/* Skill selector */}
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label htmlFor="skill" className="text-xs flex items-center gap-1">
                <BrainCircuitIcon className="size-3.5 text-violet-500" />
                Skill (tùy chọn)
              </Label>
              <select
                id="skill"
                value={skillId ?? ''}
                onChange={(e) => setSkillId(e.target.value || null)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value="">— Không dùng Skill —</option>
                {skills === null ? (
                  <option disabled>Đang tải...</option>
                ) : skills.length === 0 ? (
                  <option disabled>Chưa có skill nào</option>
                ) : (
                  skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                )}
              </select>
              {skillId && (
                <p className="text-[10px] text-violet-600">
                  AI sẽ áp dụng phong cách + framework của skill này khi viết lại.
                </p>
              )}
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

          {/* RIGHT: Result + Image gen */}
          {result && (
            <div className="flex flex-col gap-3 min-w-0">
              {/* Text result */}
              <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-4 py-4 space-y-3">
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

              {/* Image generation section */}
              <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    if (!imgExpanded && !imgPrompt) {
                      setImgPrompt(result.slice(0, 800));
                    }
                    setImgExpanded((v) => !v);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="size-4 text-blue-500" />
                    Tạo ảnh minh hoạ
                  </span>
                  <ChevronDownIcon className={cn('size-4 text-zinc-400 transition-transform', imgExpanded && 'rotate-180')} />
                </button>

                {imgExpanded && (
                  <div className="border-t border-zinc-100 px-4 py-4 flex flex-col gap-3">
                    {/* Kích thước */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Kích thước ảnh</Label>
                      <div className="flex gap-1.5 flex-wrap">
                        {([
                          { v: '1024x1024', label: '1:1 (Vuông)' },
                          { v: '1792x1024', label: '16:9 (Ngang)' },
                          { v: '1024x1792', label: '9:16 (Dọc)' },
                        ] as const).map(({ v, label }) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setImgSize(v)}
                            className={cn(
                              'px-2.5 py-1 rounded text-xs ring-1 transition',
                              imgSize === v
                                ? 'bg-blue-50 text-blue-700 ring-blue-300'
                                : 'bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-400'
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Prompt */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Prompt ảnh</Label>
                      <textarea
                        value={imgPrompt}
                        onChange={(e) => setImgPrompt(e.target.value)}
                        rows={4}
                        maxLength={4000}
                        placeholder="Mô tả ảnh bạn muốn tạo — đã điền từ nội dung, có thể chỉnh lại"
                        className="rounded border border-zinc-300 bg-white px-3 py-2 text-xs resize-y focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                      <p className="text-[10px] text-zinc-400">{imgPrompt.length}/4000 · GPT Image 2 qua 9Router</p>
                    </div>

                    {/* Generate button */}
                    <Button
                      size="sm"
                      onClick={onGenerateImage}
                      disabled={imgGenerating || !imgPrompt.trim()}
                      className="self-start bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {imgGenerating ? (
                        <><Loader2Icon className="size-3.5 animate-spin" /> Đang tạo ảnh...</>
                      ) : imgResultUrl ? (
                        <><RefreshCwIcon className="size-3.5" /> Tạo lại</>
                      ) : (
                        <><ImageIcon className="size-3.5" /> Tạo ảnh</>
                      )}
                    </Button>

                    {imgError && (
                      <p className="text-xs text-rose-600 bg-rose-50 rounded px-3 py-2">{imgError}</p>
                    )}
                    {imgResultUrl && (
                      <div className="flex flex-col gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imgResultUrl}
                          alt="Ảnh được tạo"
                          className="rounded-md w-full object-contain max-h-64 border border-zinc-200"
                        />
                        <a
                          href={imgResultUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline self-start"
                        >
                          <DownloadIcon className="size-3.5" />
                          Mở / Tải ảnh
                        </a>
                      </div>
                    )}
                  </div>
                )}
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
