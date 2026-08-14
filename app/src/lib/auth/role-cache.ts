import { db } from '../db';

/**
 * Đọc role kèm cache TTL ngắn — dành cho proxy, nơi mỗi request đều phải kiểm
 * tra quyền. Không cache trong session (dễ stale tới 7 ngày); TTL 15s giới hạn
 * cửa sổ stale khi admin đổi role của ai đó.
 *
 * Các page/API route vẫn dùng `getUserRole()` (query trực tiếp, luôn tươi).
 *
 * Cache đặt trên globalThis giống pool ở lib/db.ts: Next bundle proxy tách khỏi
 * server bundle, nên biến module-level sẽ có 2 bản riêng và `invalidateRoleCache`
 * gọi từ API route sẽ không chạm tới cache mà proxy đang đọc.
 */
const TTL_MS = 15_000;
const MAX_ENTRIES = 500;

type RoleCache = Map<string, { role: string | null; expiresAt: number }>;

declare global {
  // eslint-disable-next-line no-var
  var __roleCache: RoleCache | undefined;
}

const cache: RoleCache = (globalThis.__roleCache ??= new Map());

export async function getUserRoleCached(userId: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.role;

  const res = await db.query<{ role: string }>(
    `SELECT role FROM team_member WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const role = res.rows[0]?.role ?? null;

  if (cache.size >= MAX_ENTRIES) {
    for (const [key, value] of cache) {
      if (value.expiresAt <= now) cache.delete(key);
    }
    if (cache.size >= MAX_ENTRIES) cache.clear();
  }
  cache.set(userId, { role, expiresAt: now + TTL_MS });
  return role;
}

/** Xoá cache cho 1 user — gọi ngay sau khi admin đổi role để hiệu lực tức thì. */
export function invalidateRoleCache(userId: string): void {
  cache.delete(userId);
}
