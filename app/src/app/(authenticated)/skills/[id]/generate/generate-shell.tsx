'use client';

// Client shell cho /skills/[id]/generate.
//
// Layout 2-column:
//   - Left: form (tab Ảnh / Video, model select, prompt, params, Submit)
//   - Right: result preview + history grid của assets gần đây
//
// Flow:
//   1. User chọn tab + model + nhập prompt + params → Submit
//   2. POST /api/skills/[id]/generate → trả assetId
//   3. Poll GET /api/generate/[assetId]/status mỗi 5s (max 5 phút)
//   4. status='success' → hiện kết quả · status='failed' → hiện error

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ImageIcon,
  VideoIcon,
  Loader2Icon,
  DownloadIcon,
  XCircleIcon,
  CheckCircleIcon,
  SendIcon,
} from 'lucide-react';
import type { KieModelOption } from '@/lib/llm/kie-ai';
import type { GeneratedAsset } from '@/lib/queries/generated-asset';

interface Props {
  skillId: string;
  imageModels: KieModelOption[];
  videoModels: KieModelOption[];
  initialAssets: GeneratedAsset[];
}

type Tab = 'image' | 'video';

interface PollState {
  assetId: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  resultUrl: string | null;
  errorMessage: string | null;
  model: string;
  assetType: 'image' | 'video';
  prompt: string;
  costCredits: number | null;
}

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 5 * 60_000; // 5 phút

export function GenerateShell({
  skillId,
  imageModels,
  videoModels,
  initialAssets,
}: Props) {
  const [tab, setTab] = useState<Tab>('image');
  const models = tab === 'image' ? imageModels : videoModels;

  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<string>('');
  const [resolution, setResolution] = useState<string>('');
  const [duration, setDuration] = useState<string>('');
  const [mode, setMode] = useState<string>('');
  const [imageUrl, setImageUrl] = useState(''); // cho image-to-video

  const [submitting, setSubmitting] = useState(false);
  const [current, setCurrent] = useState<PollState | null>(null);
  const [history, setHistory] = useState<GeneratedAsset[]>(initialAssets);

  // Reset model + params khi đổi tab
  useEffect(() => {
    setModelId(models[0]?.id ?? '');
    setAspectRatio('');
    setResolution('');
    setDuration('');
    setMode('');
    setImageUrl('');
  }, [tab, models]);

  const model = useMemo(
    () => models.find((m) => m.id === modelId),
    [models, modelId]
  );

  // Default param values khi đổi model
  useEffect(() => {
    if (!model) return;
    setAspectRatio(model.aspectRatios?.[0] ?? '');
    setResolution(model.resolutions?.[0] ?? '');
    setDuration(model.durations?.[0] ?? '');
    setMode(model.modes?.[0] ?? '');
  }, [model]);

  // ─── Polling ────────────────────────────────────────────────────────────
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartedAtRef = useRef<number>(0);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPollTimer(), [clearPollTimer]);

  const pollOnce = useCallback(
    async (assetId: string) => {
      try {
        const res = await fetch(`/api/generate/${assetId}/status`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as PollState;
        setCurrent(data);

        if (data.status === 'success' || data.status === 'failed') {
          clearPollTimer();
          if (data.status === 'success') {
            toast.success('Tạo media thành công');
          } else {
            toast.error(`Tạo media thất bại: ${data.errorMessage ?? '?'}`);
          }
          // Refresh history (đẩy item mới lên đầu, tránh re-fetch full list)
          setHistory((prev) => {
            const filtered = prev.filter((a) => a.id !== assetId);
            // Build temp asset row từ poll state
            const newest: GeneratedAsset = {
              id: data.assetId,
              skillId,
              userId: '', // unused trong UI
              assetType: data.assetType,
              model: data.model,
              prompt: data.prompt,
              inputParams: {},
              taskId: null,
              status: data.status,
              resultUrl: data.resultUrl,
              rawResponse: null,
              errorMessage: data.errorMessage,
              costCredits: data.costCredits,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            };
            return [newest, ...filtered].slice(0, 30);
          });
          return;
        }

        // Còn pending/running → schedule lần poll tiếp
        if (Date.now() - pollStartedAtRef.current > MAX_POLL_MS) {
          clearPollTimer();
          toast.error('Quá thời gian chờ (5 phút). Refresh để check lại.');
          return;
        }
        pollTimerRef.current = setTimeout(
          () => pollOnce(assetId),
          POLL_INTERVAL_MS
        );
      } catch (err) {
        // Lỗi tạm thời (network blip, kie.ai 5xx) → thử lại
        // nhưng không spam toast.
        if (Date.now() - pollStartedAtRef.current > MAX_POLL_MS) {
          clearPollTimer();
          toast.error(`Poll thất bại: ${(err as Error).message}`);
          return;
        }
        pollTimerRef.current = setTimeout(
          () => pollOnce(assetId),
          POLL_INTERVAL_MS
        );
      }
    },
    [clearPollTimer, skillId]
  );

  // ─── Submit ─────────────────────────────────────────────────────────────
  async function onSubmit() {
    if (!model) {
      toast.error('Chọn model trước');
      return;
    }
    if (prompt.trim().length < 3) {
      toast.error('Prompt quá ngắn');
      return;
    }

    setSubmitting(true);
    clearPollTimer();
    setCurrent(null);

    // Build input theo model
    const input: Record<string, unknown> = {};
    if (aspectRatio && model.aspectRatios) input.aspect_ratio = aspectRatio;
    if (resolution && model.resolutions) input.resolution = resolution;
    if (duration && model.durations) input.duration = duration;
    if (mode && model.modes) input.mode = mode;
    if (imageUrl && model.acceptsImageInput) {
      input.image_url = imageUrl;
      input.image_urls = [imageUrl];
    }

    try {
      const res = await fetch(`/api/skills/${skillId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.id,
          prompt: prompt.trim(),
          input,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        assetId?: string;
        error?: string;
      };

      if (!res.ok || !data.assetId) {
        toast.error(data.error ?? `HTTP ${res.status}`);
        return;
      }

      setCurrent({
        assetId: data.assetId,
        status: 'running',
        resultUrl: null,
        errorMessage: null,
        model: model.id,
        assetType: model.type,
        prompt: prompt.trim(),
        costCredits: null,
      });
      toast.info(`Đã gửi yêu cầu. Đang xử lý (${model.label})...`);

      pollStartedAtRef.current = Date.now();
      pollTimerRef.current = setTimeout(
        () => pollOnce(data.assetId!),
        POLL_INTERVAL_MS
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 min-h-[calc(100vh-12rem)]">
      {/* ─── LEFT: Form ────────────────────────────────────────── */}
      <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm flex flex-col">
        {/* Tab switcher */}
        <div className="flex gap-1 p-2 border-b border-zinc-100">
          <button
            type="button"
            onClick={() => setTab('image')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition',
              tab === 'image'
                ? 'bg-pink-50 text-pink-700 ring-1 ring-pink-200'
                : 'text-zinc-500 hover:bg-zinc-50'
            )}
          >
            <ImageIcon className="size-4" />
            Tạo ảnh
          </button>
          <button
            type="button"
            onClick={() => setTab('video')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition',
              tab === 'video'
                ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200'
                : 'text-zinc-500 hover:bg-zinc-50'
            )}
          >
            <VideoIcon className="size-4" />
            Tạo video
          </button>
        </div>

        {/* Form fields */}
        <div className="p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
          {/* Model select */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="model" className="text-xs">
              Model
            </Label>
            <select
              id="model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} {m.estimatedCost ? `(${m.estimatedCost})` : ''}
                </option>
              ))}
            </select>
            {model?.description && (
              <p className="text-[11px] text-zinc-500">{model.description}</p>
            )}
          </div>

          {/* Prompt */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="prompt" className="text-xs">
              Prompt
            </Label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder={
                tab === 'image'
                  ? 'A cinematic photo of a Vietnamese street food vendor at golden hour, shallow depth of field, 35mm lens...'
                  : 'A young chef tossing noodles in a wok, slow-motion shot, steam rising, cinematic lighting...'
              }
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-mono leading-relaxed resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
            <p className="text-[11px] text-zinc-500">
              Càng cụ thể càng tốt — mô tả chủ thể, ánh sáng, góc máy, phong cách.
            </p>
          </div>

          {/* Aspect ratio */}
          {model?.aspectRatios && model.aspectRatios.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Tỉ lệ</Label>
              <div className="flex flex-wrap gap-1.5">
                {model.aspectRatios.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAspectRatio(r)}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs ring-1 transition',
                      aspectRatio === r
                        ? 'bg-pink-50 text-pink-700 ring-pink-300'
                        : 'bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-400'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resolution */}
          {model?.resolutions && model.resolutions.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Độ phân giải</Label>
              <div className="flex flex-wrap gap-1.5">
                {model.resolutions.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setResolution(r)}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs ring-1 transition',
                      resolution === r
                        ? 'bg-pink-50 text-pink-700 ring-pink-300'
                        : 'bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-400'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Duration (video only) */}
          {model?.durations && model.durations.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Thời lượng (giây)</Label>
              <div className="flex flex-wrap gap-1.5">
                {model.durations.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs ring-1 transition',
                      duration === d
                        ? 'bg-violet-50 text-violet-700 ring-violet-300'
                        : 'bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-400'
                    )}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mode (grok-imagine: normal/premium) */}
          {model?.modes && model.modes.length > 0 && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Chế độ</Label>
              <div className="flex flex-wrap gap-1.5">
                {model.modes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs ring-1 transition',
                      mode === m
                        ? 'bg-amber-50 text-amber-700 ring-amber-300'
                        : 'bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-400'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Image URL (image-to-video, image-to-image) */}
          {model?.acceptsImageInput && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="img-url" className="text-xs">
                URL ảnh nguồn (image-to-{tab})
              </Label>
              <Input
                id="img-url"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-zinc-500">
                Public URL (Facebook CDN, S3, Cloudinary, ...) — kie.ai sẽ fetch.
              </p>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="p-3 border-t border-zinc-100 bg-zinc-50/50 rounded-b-xl">
          <Button
            onClick={onSubmit}
            disabled={submitting || !!current && (current.status === 'pending' || current.status === 'running')}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Đang gửi...
              </>
            ) : (
              <>
                <SendIcon className="size-4" />
                Tạo {tab === 'image' ? 'ảnh' : 'video'} (
                {model?.estimatedCost ?? '?'})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ─── RIGHT: Result + History ───────────────────────────── */}
      <div className="flex flex-col gap-4 min-w-0">
        {/* Current task */}
        <CurrentTask state={current} />

        {/* History */}
        <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-4 min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">
            Lịch sử ({history.length})
          </h3>
          {history.length === 0 ? (
            <p className="text-xs text-zinc-500 italic">
              Chưa có asset nào. Tạo lần đầu để xem ở đây.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {history.map((a) => (
                <HistoryItem key={a.id} asset={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function CurrentTask({ state }: { state: PollState | null }) {
  if (!state) {
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50/30 px-5 py-8 text-center text-sm text-zinc-500">
        Form bên trái → Submit để bắt đầu tạo media. Kết quả sẽ hiện ở đây.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white ring-1 ring-zinc-200 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        {state.status === 'success' ? (
          <CheckCircleIcon className="size-4 text-emerald-600" />
        ) : state.status === 'failed' ? (
          <XCircleIcon className="size-4 text-rose-600" />
        ) : (
          <Loader2Icon className="size-4 animate-spin text-pink-600" />
        )}
        <span className="text-sm font-semibold text-zinc-900">
          {state.status === 'success'
            ? 'Hoàn tất'
            : state.status === 'failed'
              ? 'Thất bại'
              : 'Đang xử lý...'}
        </span>
        <span className="text-xs text-zinc-400">·</span>
        <span className="text-xs text-zinc-500 font-mono truncate">
          {state.model}
        </span>
        {state.costCredits !== null && (
          <>
            <span className="text-xs text-zinc-400">·</span>
            <span className="text-xs text-zinc-500">
              {state.costCredits} credits
            </span>
          </>
        )}
      </div>

      <div className="text-xs text-zinc-500 mb-3 line-clamp-2 font-mono">
        {state.prompt}
      </div>

      {state.status === 'success' && state.resultUrl && (
        <div className="space-y-2">
          {state.assetType === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.resultUrl}
              alt={state.prompt}
              className="w-full max-h-[60vh] object-contain rounded-lg ring-1 ring-zinc-200"
            />
          ) : (
            <video
              src={state.resultUrl}
              controls
              className="w-full max-h-[60vh] rounded-lg ring-1 ring-zinc-200 bg-black"
            />
          )}
          <a
            href={state.resultUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-pink-600 hover:text-pink-800 underline"
          >
            <DownloadIcon className="size-3.5" />
            Tải về URL gốc
          </a>
        </div>
      )}

      {state.status === 'failed' && state.errorMessage && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 break-words">
          {state.errorMessage}
        </div>
      )}

      {(state.status === 'pending' || state.status === 'running') && (
        <div className="text-xs text-zinc-500 italic">
          Đang đợi kie.ai... (poll mỗi 5s, timeout 5 phút). Có thể đóng tab nếu
          đã chạy &gt; 30s — kết quả vẫn lưu lại trong DB, refresh sau để xem.
        </div>
      )}
    </div>
  );
}

function HistoryItem({ asset }: { asset: GeneratedAsset }) {
  if (asset.status === 'success' && asset.resultUrl) {
    const isVideo = asset.assetType === 'video';
    return (
      <a
        href={asset.resultUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block aspect-square overflow-hidden rounded-lg ring-1 ring-zinc-200 hover:ring-pink-300 group relative"
        title={asset.prompt}
      >
        {isVideo ? (
          <video
            src={asset.resultUrl}
            className="w-full h-full object-cover bg-black"
            muted
            preload="metadata"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.resultUrl}
            alt={asset.prompt}
            className="w-full h-full object-cover"
          />
        )}
        {isVideo && (
          <div className="absolute top-1 right-1 bg-black/60 text-white rounded px-1 text-[10px] flex items-center gap-0.5">
            <VideoIcon className="size-2.5" />
            video
          </div>
        )}
      </a>
    );
  }

  return (
    <div
      className={cn(
        'aspect-square rounded-lg ring-1 flex flex-col items-center justify-center text-center px-2',
        asset.status === 'failed'
          ? 'ring-rose-200 bg-rose-50/50 text-rose-700'
          : 'ring-zinc-200 bg-zinc-50 text-zinc-500'
      )}
      title={asset.prompt}
    >
      {asset.status === 'failed' ? (
        <>
          <XCircleIcon className="size-5 mb-1" />
          <span className="text-[10px]">Failed</span>
        </>
      ) : (
        <>
          <Loader2Icon className="size-5 animate-spin mb-1" />
          <span className="text-[10px]">{asset.status}</span>
        </>
      )}
    </div>
  );
}
