'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2Icon } from 'lucide-react';

// Lark logo inline SVG (simplified)
function LarkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#0B6EFD" />
      <path
        d="M7 8h10M7 12h6M7 16h8"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface Props {
  days: number;
  tagSlug?: string | null;
}

export function LarkSendButton({ days, tagSlug }: Props) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const res = await fetch('/api/lark/send-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, tagSlug: tagSlug ?? null }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? 'Gửi Lark thất bại');
        return;
      }
      toast.success('Đã gửi báo cáo vào Lark!');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={busy}
      className="gap-1.5"
    >
      {busy ? (
        <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <LarkIcon className="w-3.5 h-3.5" />
      )}
      Gửi Lark
    </Button>
  );
}
