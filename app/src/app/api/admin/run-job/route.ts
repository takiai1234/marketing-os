// POST /api/admin/run-job — trigger a cron job manually.
// Body: { job: 'page_insights' | 'posts' | 'health' | 'ladipage'
//              | 'bundle_import' | 'bundle_import_poller' | 'bundle_connect_poller' }
//
// Auth (một trong hai):
//   - Session admin (gọi từ UI), HOẶC
//   - Header `Authorization: Bearer <CRON_TRIGGER_TOKEN>` (cho scheduler ngoài
//     như Coolify Scheduled Task / GitHub Actions). Chỉ bật khi env
//     CRON_TRIGGER_TOKEN được set.
//
// Lý do tồn tại: cron in-process (node-cron qua instrumentation) KHÔNG fire ổn
// định trong prod standalone → các job Bundle từng kẹt 15 ngày. Endpoint này
// cho phép 1 scheduler bên ngoài gọi định kỳ, job chạy NGAY trong server (có
// sẵn DB + env), không phụ thuộc instrumentation.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';

export const runtime = 'nodejs';

const bodySchema = z.object({
  job: z.enum([
    'page_insights',
    'posts',
    'health',
    'ladipage',
    'bundle_import',
    'bundle_import_poller',
    'bundle_connect_poller',
  ]),
});

/** Constant-time compare token from `Authorization: Bearer <token>` against env. */
function hasValidCronToken(req: NextRequest): boolean {
  const expected = process.env.CRON_TRIGGER_TOKEN;
  if (!expected) return false;
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return false;
  const provided = header.slice(7);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth: bearer token (scheduler) HOẶC session admin (UI).
  if (!hasValidCronToken(req)) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const role = await getUserRole(user.userId);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          'job phải là một trong: page_insights, posts, health, ladipage, bundle_import, bundle_import_poller, bundle_connect_poller',
      },
      { status: 400 }
    );
  }

  const { job } = parsed.data;
  const startedAt = Date.now();

  try {
    // Fire-and-await — caller waits for completion so they see whether the run
    // actually succeeded. Bundle import job chỉ TRIGGER import (không đợi xong),
    // poller finalize các import đã COMPLETED → đều bounded, an toàn cho HTTP.
    let report: unknown = null;
    switch (job) {
      case 'page_insights': {
        const { runPageInsightsJob } = await import('@/lib/cron/job-page-insights');
        await runPageInsightsJob();
        break;
      }
      case 'posts': {
        const { runPostsIngestionJob } = await import('@/lib/cron/job-posts-ingestion');
        await runPostsIngestionJob();
        break;
      }
      case 'health': {
        const { runHealthRecomputeJob } = await import('@/lib/cron/job-health-recompute');
        await runHealthRecomputeJob();
        break;
      }
      case 'ladipage': {
        const { runLadipageSyncJob } = await import('@/lib/cron/job-ladipage-sync');
        await runLadipageSyncJob();
        break;
      }
      case 'bundle_import': {
        const { runBundleImportJob } = await import('@/lib/cron/job-bundle-import');
        report = await runBundleImportJob();
        break;
      }
      case 'bundle_import_poller': {
        const { runBundleImportPollerJob } = await import('@/lib/cron/job-bundle-import-poller');
        report = await runBundleImportPollerJob();
        break;
      }
      case 'bundle_connect_poller': {
        const { runBundleConnectPollerJob } = await import('@/lib/cron/job-bundle-connect-poller');
        report = await runBundleConnectPollerJob();
        break;
      }
    }
    return NextResponse.json({
      ok: true,
      job,
      report,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, job, error: msg, durationMs: Date.now() - startedAt },
      { status: 500 }
    );
  }
}
