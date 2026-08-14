import { NextRequest, NextResponse } from 'next/server';
import { unsealData } from 'iron-session';
import type { SessionData } from '@/lib/auth/session-config';
import { getUserRoleCached } from '@/lib/auth/role-cache';
import { isPathDeniedForGuest, isWriteBlockedForGuest } from '@/lib/auth/roles';

// Next.js 16 proxy convention (replaces deprecated middleware).
// Runtime is Node.js — Edge is not supported here. bcryptjs/pg/next-headers
// could technically be imported now, but we keep this file minimal to stay
// fast on every matched request.
//
// Ngoại lệ: role `guest` cần 1 query role → dùng getUserRoleCached (TTL 15s)
// nên chi phí thêm gần như bằng 0 sau request đầu tiên.

const COOKIE_NAME = 'mos_session';

// ttl must match sessionOptions (7 days in seconds = 604800)
const SESSION_TTL = 60 * 60 * 24 * 7;

// `api/skills/upload` được loại trừ vì Next.js 16 proxy default buffer
// 10MB body (proxyClientMaxBodySize) — sẽ truncate file lớn. Route handler
// tự check session bên trong nên không mất bảo mật.
//
// `api/news/ingest-ads` và `api/news/ingest-web` được loại trừ vì gọi từ
// Chrome extension (không có session cookie) — route tự xác thực bằng bearer
// token ADS_INGEST_TOKEN. Nếu không loại trừ, proxy redirect /login →
// extension không push được.
//
// `api/admin/run-job` được loại trừ vì scheduler ngoài (Coolify Scheduled Task)
// gọi bằng bearer CRON_TRIGGER_TOKEN, không có session cookie. Route tự xác
// thực (token HOẶC session admin) nên không mất bảo mật.
export const config = {
  matcher: [
    '/((?!api/auth|api/skills/upload|api/news/ingest-ads|api/news/ingest-web|api/admin/run-job|api/admin/tiktok-debug|api/telegram/webhook|api/analytics/overview|_next|favicon.ico|public|login).*)',
  ],
};

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Root '/' is the public landing page — let it through unauthenticated.
  // The page itself handles "already logged in" by redirecting to /dashboard,
  // so the proxy would only get in the way here.
  //
  // Why not exclude '/' in the matcher regex above? Next.js path-to-regexp
  // can't anchor to "exactly /" without matching all subpaths too. Easier
  // to short-circuit in the handler.
  if (request.nextUrl.pathname === '/') {
    return NextResponse.next();
  }

  const sessionPassword = process.env.SESSION_PASSWORD;

  // If SESSION_PASSWORD is not configured, always redirect to login
  if (!sessionPassword || sessionPassword.length < 32) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;

  if (cookieValue) {
    try {
      const session = await unsealData<SessionData>(cookieValue, {
        password: sessionPassword,
        ttl: SESSION_TTL,
      });

      if (session.userId) {
        return enforceGuestPolicy(request, session.userId);
      }
    } catch {
      // Tampered or expired cookie — fall through to redirect
    }
  }

  return NextResponse.redirect(new URL('/login', request.url));
}

/**
 * Chốt chặn tập trung cho role `guest` (Khách — chỉ xem).
 *
 * Đặt ở proxy thay vì rải guard vào ~72 API route vì fail-closed: route mới
 * thêm sau này tự động được bảo vệ, không phụ thuộc việc ai đó nhớ thêm guard.
 *
 * Chặn hai thứ:
 *  1. /ads, /landing-pages, /revenue, /lark-base và các API đứng sau chúng.
 *  2. Mọi request ghi (POST/PUT/PATCH/DELETE) — kể cả Server Action, vốn là
 *     POST tới chính URL của trang.
 *
 * LƯU Ý: các đường dẫn bị matcher loại trừ ở trên (vd `api/skills/upload`,
 * `api/auth/change-password`) KHÔNG đi qua đây — chúng phải tự guard bằng
 * `rejectGuest()` (src/lib/auth/guards.ts) trong route handler.
 */
async function enforceGuestPolicy(
  request: NextRequest,
  userId: string
): Promise<NextResponse> {
  const role = await getUserRoleCached(userId);
  if (role !== 'guest') return NextResponse.next();

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (isPathDeniedForGuest(pathname)) {
    return isApi
      ? NextResponse.json(
          { error: 'Không có quyền truy cập dữ liệu này.' },
          { status: 403 }
        )
      : NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (isWriteBlockedForGuest(pathname, request.method)) {
    const message = 'Tài khoản Khách chỉ có quyền xem, không được chỉnh sửa.';
    return isApi
      ? NextResponse.json({ error: message }, { status: 403 })
      : new NextResponse(message, {
          status: 403,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
  }

  return NextResponse.next();
}
