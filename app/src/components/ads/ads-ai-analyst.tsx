'use client';

import { useState, useRef } from 'react';
import { SparklesIcon, XIcon, RefreshCwIcon, ChevronRightIcon } from 'lucide-react';

interface AdsAiAnalystProps {
  endpoint: string;
  queryString?: string;
}

interface UnitEcon {
  aov: string;
  closeRate: string;
  grossMargin: string;
  profitMargin: string;
}

export function AdsAiAnalyst({ endpoint, queryString }: AdsAiAnalystProps) {
  const [step, setStep] = useState<'idle' | 'setup' | 'analyzing'>('idle');
  const [econ, setEcon] = useState<UnitEcon>({ aov: '', closeRate: '', grossMargin: '', profitMargin: '30' });
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function openSetup() {
    setStep('setup');
    setText('');
    setError(null);
  }

  async function runAnalysis() {
    setStep('analyzing');
    setLoading(true);
    setText('');
    setError(null);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    // Parse unit economics — send null if blank (AI will use benchmark fallback)
    const body: Record<string, number | null> = {
      aov: econ.aov ? Number(econ.aov.replace(/\D/g, '')) : null,
      closeRate: econ.closeRate ? Number(econ.closeRate) / 100 : null,
      grossMargin: econ.grossMargin ? Number(econ.grossMargin) / 100 : null,
      profitMargin: econ.profitMargin ? Number(econ.profitMargin) / 100 : 0.3,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    setStep('idle');
    setText('');
    setError(null);
  }

  const inputCls = 'h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/15';

  return (
    <div className="flex flex-col gap-3">
      {step === 'idle' && (
        <button
          onClick={openSetup}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors"
        >
          <SparklesIcon className="size-4" />
          Phân tích AI
        </button>
      )}

      {step === 'setup' && (
        <div className="rounded-xl bg-white ring-1 ring-violet-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50 border-b border-violet-100">
            <div className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-violet-600" />
              <span className="text-sm font-semibold text-violet-900">Phân tích AI — Nhập kinh tế đơn vị</span>
            </div>
            <button onClick={close} className="p-1.5 rounded hover:bg-violet-100 text-violet-600">
              <XIcon className="size-3.5" />
            </button>
          </div>
          <div className="px-4 py-4 flex flex-col gap-4">
            <p className="text-xs text-zinc-500">
              Nhập để tính <strong>CPL trần</strong> (ngưỡng lời). Để trống → AI dùng benchmark ngành.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-700">AOV — giá đơn TB (VNĐ)</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="VD: 500000"
                  value={econ.aov}
                  onChange={(e) => setEcon((p) => ({ ...p, aov: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-700">Tỷ lệ chốt đơn (%)</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="VD: 20"
                  value={econ.closeRate}
                  onChange={(e) => setEcon((p) => ({ ...p, closeRate: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-700">Biên lợi nhuận gộp (%)</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="VD: 40"
                  value={econ.grossMargin}
                  onChange={(e) => setEcon((p) => ({ ...p, grossMargin: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-700">Biên lời muốn giữ lại (%)</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="VD: 30"
                  value={econ.profitMargin}
                  onChange={(e) => setEcon((p) => ({ ...p, profitMargin: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={runAnalysis}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors"
              >
                Phân tích ngay
                <ChevronRightIcon className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'analyzing' && (
        <div className="rounded-xl bg-white ring-1 ring-violet-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-violet-50 border-b border-violet-100">
            <div className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-violet-600" />
              <span className="text-sm font-semibold text-violet-900">Phân tích AI — Meta Ads Profit Engine</span>
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
              <button onClick={close} className="p-1.5 rounded hover:bg-violet-100 text-violet-600">
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
        if (line.startsWith('| ')) {
          return <p key={i} className="font-mono text-xs text-zinc-600">{line}</p>;
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <p key={i} className="pl-3 text-zinc-700 before:content-['•'] before:mr-2 before:text-violet-400">
              {renderInline(line.slice(2))}
            </p>
          );
        }
        if (line.startsWith('> ')) {
          return (
            <p key={i} className="pl-3 border-l-2 border-violet-300 text-zinc-600 italic text-xs">
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
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-zinc-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
