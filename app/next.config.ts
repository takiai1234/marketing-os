import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',

  // Skip TypeScript type-checking during `next build` — the build was hanging
  // for 40+ minutes on tsc. Type safety is enforced in CI/pre-commit, not here.
  typescript: {
    ignoreBuildErrors: true,
  },

  // Dev-mode CSRF guard: Next.js 16 blocks requests from non-localhost origins
  // unless explicitly allowlisted. The Cloudflare Tunnel domain rotates each
  // session, so we read it from env to avoid hard-coding.
  allowedDevOrigins: process.env.NEXT_PUBLIC_APP_URL
    ? [new URL(process.env.NEXT_PUBLIC_APP_URL).host]
    : [],

  // Router cache (RSC payload kept in browser memory).
  //
  // The heavy lifting happens server-side via tag-based invalidation in
  // lib/cache/dashboard-cache.ts — that cache lives until cron jobs or
  // mutations actually change the underlying data, regardless of clock time.
  //
  // The client router cache is here as a small comfort layer: 60s lets
  // back/forward navigation feel instant without showing data older than the
  // server cache itself would.
  experimental: {
    staleTimes: {
      dynamic: 60,
      static: 180,
    },
  },
};

export default nextConfig;
