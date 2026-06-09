// Channel tag queries — M:N social_account ↔ channel_tag.
//
// Dashboard tab filter dùng `slug` thay vì id để URL bookmark được:
//   /dashboard?tag=ai → fetch* nhận tagSlug='ai' → INNER JOIN channel_tag
//   ON ct.slug='ai'.
//
// Tag CRUD chỉ admin được dùng — route handlers check role trước khi gọi
// các hàm mutate ở đây.

import { db } from '@/lib/db';

export interface ChannelTag {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

/** Normalize slug — lowercase a-z0-9-. KHÔNG dùng cho seed sẵn (slug đã đẹp).
 *  Dùng khi admin tạo tag mới qua UI. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'tag';
}

/** List tất cả tag — order theo sort_order ASC rồi name ASC. */
export async function listAllTags(): Promise<ChannelTag[]> {
  const res = await db.query<{
    id: string;
    name: string;
    slug: string;
    sort_order: number;
  }>(
    `SELECT id, name, slug, sort_order
     FROM channel_tag
     ORDER BY sort_order ASC, name ASC`
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    sortOrder: r.sort_order,
  }));
}

/** Tag-ids đang gán cho 1 kênh. */
export async function getTagsForAccount(accountId: string): Promise<ChannelTag[]> {
  const res = await db.query<{
    id: string;
    name: string;
    slug: string;
    sort_order: number;
  }>(
    `SELECT ct.id, ct.name, ct.slug, ct.sort_order
     FROM channel_tag ct
     INNER JOIN social_account_tag sat ON sat.tag_id = ct.id
     WHERE sat.account_id = $1
     ORDER BY ct.sort_order ASC, ct.name ASC`,
    [accountId]
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    sortOrder: r.sort_order,
  }));
}

/** Replace toàn bộ tag list cho 1 kênh (set-style). Transaction để atomic. */
export async function setTagsForAccount(
  accountId: string,
  tagIds: string[]
): Promise<void> {
  await db.query('BEGIN');
  try {
    await db.query(`DELETE FROM social_account_tag WHERE account_id = $1`, [accountId]);
    if (tagIds.length > 0) {
      // Build VALUES list ($1, $2), ($1, $3), ... — accountId luôn $1
      const valuesSql = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO social_account_tag (account_id, tag_id) VALUES ${valuesSql}
         ON CONFLICT DO NOTHING`,
        [accountId, ...tagIds]
      );
    }
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

/** Tạo tag mới. Slug auto-generate nếu admin không cung cấp.
 *  Returns null nếu slug đã tồn tại (caller hiển thị error friendly). */
export async function createTag(
  name: string,
  slug?: string,
  sortOrder?: number
): Promise<ChannelTag | null> {
  const finalSlug = slug ? slugify(slug) : slugify(name);
  const finalOrder = sortOrder ?? 100; // mới tạo → cuối list

  try {
    const res = await db.query<{
      id: string;
      name: string;
      slug: string;
      sort_order: number;
    }>(
      `INSERT INTO channel_tag (name, slug, sort_order)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug, sort_order`,
      [name.trim(), finalSlug, finalOrder]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      sortOrder: row.sort_order,
    };
  } catch (err) {
    // 23505 = unique violation (slug đã tồn tại)
    if ((err as { code?: string }).code === '23505') return null;
    throw err;
  }
}

/** Đổi tên / sort_order. Slug KHÔNG đổi được (vì là URL key). */
export async function updateTag(
  id: string,
  patch: { name?: string; sortOrder?: number }
): Promise<void> {
  const updates: string[] = [];
  const params: unknown[] = [id];
  let i = 2;
  if (patch.name !== undefined) {
    updates.push(`name = $${i++}`);
    params.push(patch.name.trim());
  }
  if (patch.sortOrder !== undefined) {
    updates.push(`sort_order = $${i++}`);
    params.push(patch.sortOrder);
  }
  if (updates.length === 0) return;
  await db.query(
    `UPDATE channel_tag SET ${updates.join(', ')} WHERE id = $1`,
    params
  );
}

/** Xoá tag. Cascade tự bóc mọi mapping trong social_account_tag. */
export async function deleteTag(id: string): Promise<void> {
  await db.query(`DELETE FROM channel_tag WHERE id = $1`, [id]);
}

/** Resolve slug → tag-id (null nếu không tồn tại). Dùng trong dashboard
 *  queries để validate tag param trước khi JOIN. */
export async function getTagBySlug(slug: string): Promise<ChannelTag | null> {
  const res = await db.query<{
    id: string;
    name: string;
    slug: string;
    sort_order: number;
  }>(
    `SELECT id, name, slug, sort_order FROM channel_tag WHERE slug = $1`,
    [slug]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
  };
}
