'use client';

import { useState, useRef } from 'react';
import { SparklesIcon, XIcon, RefreshCwIcon, ChevronRightIcon, PlusIcon, Trash2Icon } from 'lucide-react';

interface AdsAiAnalystProps {
  endpoint: string;
  queryString?: string;
}

interface ProductCpl {
  id: number;
  name: string;
  cplTarget: string;   // CPL trần (mục tiêu lời)
  cplBreakeven: string; // CPL hòa vốn (optional)
}

let nextId = 1;

export function AdsAiAnalyst({ endpoint, queryString }: AdsAiAnalystProps) {
  const [step, setStep] = useState<'idle' | 'setup' | 'analyzing'>('idle');
  const [products, setProducts] = useState<ProductCpl[]>([
    { id: nextId++, name: '', cplTarget: '', cplBreakeven: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function openSetup() {
    setStep('setup');
    setText('');
    setError(null);
  }

  function addProduct() {
    setProducts((p) => [...p, { id: nextId++, name: '', cplTarget: '', cplBreakeven: '' }]);
  }

  function removeProduct(id: number) {
    setProducts((p) => p.filter((x) => x.id !== id));
  }

  function updateProduct(id: number, field: keyof Omit<ProductCpl, 'id'>, value: string) {
    setProducts((p) => p.map((x) => x.id === id ? { ...x, [field]: value } : x));
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

    const validProducts = products
      .filter((p) => p.name.trim() && p.cplTarget.trim())
      .map((p) => ({
        name: p.name.trim(),
        cplTarget: Number(p.cplTarget.replace(/\D/g, '')),
        cplBreakeven: p.cplBreakeven ? Number(p.cplBreakeven.replace(/\D/g, '')) : null,
      }));

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: validProducts }),
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

  const inputCls = 'h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/15';

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
              <span className="text-sm font-semibold text-violet-900">Phân tích AI — Nhập CPL trần theo sản phẩm</span>
            </div>
            <button onClick={close} className="p-1.5 rounded hover:bg-violet-100 text-violet-600">
              <XIcon className="size-3.5" />
            </button>
          </div>

          <div className="px-4 py-4 flex flex-col gap-4">
            <p className="text-xs text-zinc-500">
              Nhập tên sản phẩm và <strong>CPL trần</strong> (ngưỡng có lời).
              AI sẽ match campaign với sản phẩm để đánh giá đúng ngưỡng.
              Để trống → AI dùng benchmark ngành.
            </p>

            <div className="flex flex-col gap-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-0.5">
                <span className="text-xs font-medium text-zinc-500">Tên sản phẩm</span>
                <span className="text-xs font-medium text-zinc-500">CPL trần (lời)</span>
                <span className="text-xs font-medium text-zinc-500">CPL hòa vốn</span>
                <span className="w-7" />
              </div>

              {products.map((p) => (
                <div key={p.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                  <input
                    className={inputCls}
                    placeholder="VD: AI Power"
                    value={p.name}
                    onChange={(e) => updateProduct(p.id, 'name', e.target.value)}
                  />
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    placeholder="VD: 150000"
                    value={p.cplTarget}
                    onChange={(e) => updateProduct(p.id, 'cplTarget', e.target.value)}
                  />
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    placeholder="Tuỳ chọn"
                    value={p.cplBreakeven}
                    onChange={(e) => updateProduct(p.id, 'cplBreakeven', e.target.value)}
                  />
                  <button
                    onClick={() => removeProduct(p.id)}
                    className="p-1.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30"
                    disabled={products.length === 1}
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </div>
              ))}

              <button
                onClick={addProduct}
                className="inline-flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 mt-1 self-start"
              >
                <PlusIcon className="size-3.5" />
                Thêm sản phẩm
              </button>
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
          return <p key={i} className="font-mono text-xs text-zinc-600 whitespace-pre">{line}</p>;
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
