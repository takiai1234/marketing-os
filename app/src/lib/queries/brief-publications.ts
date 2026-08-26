// Queries cho brief_publication — lịch sử đăng brief lên kênh social.
// Flow 3 bước: createPublicationAttempt (status=publishing) → gọi platform API
// → markPublicationPublished / markPublicationFailed. Giữ cả row fail để debug.

import { db } from '@/lib/db';

export type BriefPublicationStatusT = 'publishing' | 'published' | 'failed';

export interface BriefPublication {
  id: string;
  brief_id: string;
  channel_id: string;
  channel_name: string;
  platform: string;
  status: BriefPublicationStatusT;
  external_post_id: string | null;
  permalink_url: string | null;
  error_message: string | null;
  published_by_name: string | null;
  created_at: string;
  published_at: string | null;
}

/** Kênh đủ điều kiện đăng bài — phase 1 chỉ Facebook Page có token */
export interface PublishableChannel {
  id: string;
  name: string;
  platform: string;
}

interface PublicationRow {
  id: string;
  brief_id: string;
  channel_id: string;
  channel_name: string;
  platform: string;
  status: BriefPublicationStatusT;
  external_post_id: string | null;
  permalink_url: string | null;
  error_message: string | null;
  published_by_name: string | null;
  created_at: Date;
  published_at: Date | null;
}

const PUBLICATION_SELECT_SQL = `
  SELECT
    bp.id,
    bp.brief_id,
    bp.social_account_id AS channel_id,
    sa.name              AS channel_name,
    sa.platform::text    AS platform,
    bp.status,
    bp.external_post_id,
    bp.permalink_url,
    bp.error_message,
    tm.name              AS published_by_name,
    bp.created_at,
    bp.published_at
  FROM brief_publication bp
  JOIN social_account sa ON sa.id = bp.social_account_id
  LEFT JOIN team_member tm ON tm.id = bp.published_by_member_id
`;

function mapRow(r: PublicationRow): BriefPublication {
  return {
    ...r,
    created_at: r.created_at.toISOString(),
    published_at: r.published_at ? r.published_at.toISOString() : null,
  };
}

/** Toàn bộ publications của 1 brief — mới nhất trước */
export async function listPublicationsForBrief(
  briefId: string
): Promise<BriefPublication[]> {
  const result = await db.query<PublicationRow>(
    `${PUBLICATION_SELECT_SQL} WHERE bp.brief_id = $1 ORDER BY bp.created_at DESC`,
    [briefId]
  );
  return result.rows.map(mapRow);
}

/** Brief này đã có bài đăng THÀNH CÔNG trên kênh này chưa — chặn đăng trùng */
export async function hasPublishedToChannel(
  briefId: string,
  channelId: string
): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM brief_publication
     WHERE brief_id = $1 AND social_account_id = $2 AND status = 'published'
     LIMIT 1`,
    [briefId, channelId]
  );
  return result.rows.length > 0;
}

/** Tạo attempt row (status=publishing) TRƯỚC khi gọi platform API —
 *  nếu process chết giữa chừng vẫn còn vết để đối chiếu với Page. */
export async function createPublicationAttempt(
  briefId: string,
  channelId: string,
  memberId: string
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO brief_publication (brief_id, social_account_id, published_by_member_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [briefId, channelId, memberId]
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('INSERT brief_publication failed — không có id trả về');
  return id;
}

export async function markPublicationPublished(
  id: string,
  externalPostId: string,
  permalinkUrl: string | null
): Promise<BriefPublication | null> {
  await db.query(
    `UPDATE brief_publication
     SET status = 'published', external_post_id = $1, permalink_url = $2, published_at = NOW()
     WHERE id = $3`,
    [externalPostId, permalinkUrl, id]
  );
  const result = await db.query<PublicationRow>(
    `${PUBLICATION_SELECT_SQL} WHERE bp.id = $1`,
    [id]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function markPublicationFailed(
  id: string,
  errorMessage: string
): Promise<void> {
  await db.query(
    `UPDATE brief_publication SET status = 'failed', error_message = $1 WHERE id = $2`,
    [errorMessage.slice(0, 2000), id]
  );
}

/** Kênh đăng được ở phase 1: Facebook Page active + có token.
 *  Bundle.social channels (TikTok/YouTube/...) sẽ vào đây ở phase sau. */
export async function listPublishableChannels(): Promise<PublishableChannel[]> {
  const result = await db.query<PublishableChannel>(
    `SELECT id, name, platform::text AS platform
     FROM social_account
     WHERE status = 'active'
       AND platform = 'facebook'
       AND access_token_encrypted IS NOT NULL
     ORDER BY name`,
    []
  );
  return result.rows;
}
