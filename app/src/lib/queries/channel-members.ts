// Query helpers cho social_account_member many-to-many table.
// Backwards compat: cũng sync owner_member_id (first primary) khi mutate.

import { db } from '@/lib/db';

export type MemberRole = 'primary' | 'editor';

export interface ChannelMember {
  memberId: string;
  name: string;
  email: string;
  /** team_member.role — admin / member (khác với role trong join table) */
  teamRole: string;
  /** Role TRONG kênh này — primary | editor */
  role: MemberRole;
  addedAt: string;
}

/**
 * Fetch all members of a channel, ordered primary-first then by added_at.
 * Trả về empty array nếu channel chưa có member (acceptable state).
 */
export async function fetchChannelMembers(
  accountId: string
): Promise<ChannelMember[]> {
  const res = await db.query<{
    member_id: string;
    name: string;
    email: string;
    team_role: string;
    role: MemberRole;
    added_at: string;
  }>(
    `SELECT sam.member_id, tm.name, tm.email, tm.role AS team_role,
            sam.role, sam.added_at::TEXT
       FROM social_account_member sam
       JOIN team_member tm ON tm.id = sam.member_id
      WHERE sam.account_id = $1
      ORDER BY CASE WHEN sam.role = 'primary' THEN 0 ELSE 1 END,
               sam.added_at ASC`,
    [accountId]
  );

  return res.rows.map((r) => ({
    memberId: r.member_id,
    name: r.name,
    email: r.email,
    teamRole: r.team_role,
    role: r.role,
    addedAt: r.added_at,
  }));
}

export interface SetChannelMembersInput {
  memberId: string;
  role: MemberRole;
}

/**
 * Replace tất cả member của 1 channel atomically. Steps trong 1 transaction:
 *   1. DELETE all existing rows for accountId
 *   2. INSERT mới từ input
 *   3. UPDATE social_account.owner_member_id = first primary (or NULL)
 *
 * Validation business rule (caller phải đảm bảo trước khi gọi):
 *   - Mỗi memberId chỉ xuất hiện 1 lần (UNIQUE constraint throw nếu trùng)
 *   - MAX 1 primary per channel (Rule A) — DB partial unique index enforce
 *     thêm 1 lần nữa nếu API bypass
 *   - Có thể empty list = bỏ tất cả member (kênh thành "mồ côi", KPI = 0)
 */
export async function setChannelMembers(
  accountId: string,
  members: SetChannelMembersInput[]
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Wipe + reinsert. Đơn giản hơn diff-update, đảm bảo state khớp 100% input.
    await client.query(
      `DELETE FROM social_account_member WHERE account_id = $1`,
      [accountId]
    );

    if (members.length > 0) {
      // Bulk insert dùng unnest — 1 round-trip cho N rows
      await client.query(
        `INSERT INTO social_account_member (account_id, member_id, role)
         SELECT $1, member_id::UUID, role
           FROM UNNEST($2::UUID[], $3::TEXT[]) AS t(member_id, role)`,
        [
          accountId,
          members.map((m) => m.memberId),
          members.map((m) => m.role),
        ]
      );
    }

    // Sync owner_member_id = first primary (nếu có) cho backwards compat.
    // Old queries (channels-list, channel-detail) vẫn dùng owner_member_id
    // để show "primary owner name" mà không cần JOIN bảng mới.
    const firstPrimary = members.find((m) => m.role === 'primary');
    await client.query(
      `UPDATE social_account
          SET owner_member_id = $2
        WHERE id = $1`,
      [accountId, firstPrimary?.memberId ?? null]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
