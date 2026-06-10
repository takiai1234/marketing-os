'use client';

// Cover image client subcomponent — fallback gradient khi:
//   1. Không có URL (item.coverImage null)
//   2. URL có nhưng load FAIL (404, CORS block, FB CDN expire token...)
//
// Cần client component vì onError handler không chạy được trong RSC.
// Khi img onError fire → swap sang gradient + sourceName label.
//
// CSS trick: img absolute trên gradient → khi img load OK, che gradient.
// Khi onError → hide img bằng state → gradient hiện ra.

import { useState } from 'react';

interface Props {
  src: string | null;
  alt?: string;
  /** Tailwind gradient classes (vd "from-orange-400 to-red-600"). */
  gradient: string;
  /** Text overlay khi không có image (vd source name). */
  fallbackLabel: string;
}

export function NewsCoverImage({ src, alt = '', gradient, fallbackLabel }: Props) {
  const [imageFailed, setImageFailed] = useState(false);

  // Hiển thị fallback gradient nếu KHÔNG có src, hoặc src đã fail load.
  const showFallback = !src || imageFailed;

  return (
    <div className={`relative aspect-[16/9] w-full bg-gradient-to-br ${gradient}`}>
      {showFallback ? (
        <div className="absolute inset-0 flex items-center justify-center text-white/80 text-xs font-semibold tracking-wide px-3 text-center">
          {fallbackLabel}
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
