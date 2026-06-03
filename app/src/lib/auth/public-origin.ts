// Helper: lấy public origin (vd https://test002.taki.vn) cho mọi redirect
// trong OAuth flow. KHÔNG dùng req.nextUrl.origin vì sau proxy/Docker
// reverse-proxy nó trả về internal hostname (vd 0.0.0.0:3000) thay vì
// public domain → user thấy ERR_ADDRESS_INVALID khi click.
//
// Priority:
//   1. process.env.APP_URL (set qua Coolify env, đáng tin nhất)
//   2. req.nextUrl.origin (fallback nếu env thiếu — local dev)
//
// Strip trailing slash để URL composition sạch.

import type { NextRequest } from 'next/server';

export function getPublicOrigin(req: NextRequest): string {
  const envUrl = process.env.APP_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  return req.nextUrl.origin;
}
