'use client';

import { useState, useRef } from 'react';
import { SparklesIcon, XIcon, RefreshCwIcon } from 'lucide-react';

interface AdsAiAnalystProps {
  /** URL của endpoint analyze — /api/ads/accounts/[id]/analyze hoặc /api/ads/analyze */
  endpoint: string;
  /** Query string hiện tại để truyền date range */
  queryString?: string;
}

export function AdsAiAnalyst({ endpoint, queryString }: AdsAiAnalystProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function runAnalysis() {
    setOpen(true);
    setLoading(true);
    setText('');
    setError(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setText((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }

  function close() {
    abortRef.current?.abort();
    setOpen(false);
    setText('');
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={runAnalysis}
        disabled={loading}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white transition-colors"
      >
        <SparklesIcon className="size-4" />
        {loading ? 'Đang phân tích...' : 'Phân tích AI'}
      </button>

      {open && (
        <div className="rounded-xl bg-white ring-1 ring-violet-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50 border-b border-violet-100">
            <div className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-violet-600" />
              <span className="text-sm font-semibold text-violet-900">Phân tích AI — Nhà quảng cáo chuyên nghiệp</span>
            </div>
            <div className="flex items-center gap-1">
              {!loading && text && (
                <button
                  onClick={runAnalysis}
                  className="p-1.5 rounded hover:bg-violet-100 text-violet-600"
                  title="Phân tích lại"
                >
                  <RefreshCwIcon className="size-3.5" />
                </button>
              )}
              <button
                onClick={close}
                className="p-1.5 rounded hover:bg-violet-100 text-violet-600"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="px-4 py-4 text-sm text-zinc-800 leading-relaxed min-h-[80px]">
            {error ? (
              <p className="text-rose-600">{error}</p>
            ) : loading && !text ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <span className="inline-block size-2 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="inline-block size-2 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="inline-block size-2 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                <span className="text-xs">Đang phân tích dữ liệu...</span>
              </div>
            ) : (
              <MarkdownText text={text} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Render markdown đơn giản: **bold**, ## heading, dấu - list */
function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (line.startsWith('## ') || line.startsWith('### ')) {
          const content = line.replace(/^#{2,3}\s+/, '');
          return (
            <p key={i} className="font-semibold text-zinc-900 mt-3 first:mt-0">
              {renderInline(content)}
            </p>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <p key={i} className="pl-3 text-zinc-700 before:content-['•'] before:mr-2 before:text-violet-400">
              {renderInline(line.slice(2))}
            </p>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        return <p key={i} className="text-zinc-700">{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-zinc-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
