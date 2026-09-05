// POST /api/news/ingest — kích hoạt thủ công fetch tin: RSS + social.
//
// RSS (job-news-ingestion) chạy nhanh (~10s) → await xong mới trả response.
// Social (job-apify-news: Facebook qua fb-cli + Twitter qua Apify) chậm
// (1-3 phút với ~19 page) → kick chạy NỀN, không block response; UI toast
// báo user quay lại sau. Module-level lock chống chạy chồng khi user spam
// (server standalone 1 process nên lock kiểu này đủ dùng).
//
// Use cases:
//   - Bootstrap: vừa migrate xong, không muốn đợi tới phút 15 kế tiếp
//   - Debug: test sau khi sửa parser/source
//   - Admin: refresh tin ngay khi có nhu cầu
//
// Auth: chỉ user đăng nhập mới gọi được (chống spam endpoint).
// Không debounce vì lượng caller là admin nội bộ, hiếm.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { runNewsIngestionJob } from '@/lib/cron/job-news-ingestion';
import { runApifyNewsJob } from '@/lib/cron/job-apify-news';
import { revalidateTag } from 'next/cache';

export const runtime = 'nodejs';

let socialJobRunning = false;

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await runNewsIngestionJob();

    // Social job (Facebook/Twitter) — fire-and-forget, kết quả vào DB dần,
    // revalidate lại cache khi xong để lần refresh sau thấy tin.
    let social: 'started' | 'already_running' = 'already_running';
    if (!socialJobRunning) {
      socialJobRunning = true;
      social = 'started';
      runApifyNewsJob()
        .then(() => revalidateTag('news', 'max'))
        .catch((err) =>
          console.error(
            '[POST /api/news/ingest] social job fail:',
            err instanceof Error ? err.message : err
          )
        )
        .finally(() => {
          socialJobRunning = false;
        });
    }

    // Invalidate cache để UI thấy data mới ngay sau khi ingest.
    // 'max' = stale-while-revalidate, required positional arg ở Next.js 16
    // (single-arg signature deprecated). Pattern giống dashboard-cache.ts.
    revalidateTag('news', 'max');
    return NextResponse.json({ ok: true, social });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[POST /api/news/ingest]', msg);
    return NextResponse.json({ error: 'Ingestion failed', detail: msg }, { status: 500 });
  }
}
