// GET  /api/briefs/[id]/publications — lịch sử đăng kênh của 1 brief.
// POST /api/briefs/[id]/publications — đăng draft_content của brief lên 1 kênh.
//   Body: { channel_id: UUID }  (phase 1: chỉ Facebook Page)
//   Response: { publication, brief } — brief trả kèm vì status có thể
//   auto-chuyển sang 'published' sau khi đăng thành công.
//
// Guest bị chặn mọi request ghi ở proxy.ts — route chỉ cần check đăng nhập.

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { decryptToken } from '@/lib/fb/token-encryption';
import { publishPagePost } from '@/lib/fb/publish';
import { TokenExpiredError } from '@/lib/fb/types';
import { logActivity } from '@/lib/queries/briefs-activity';
import { updateBriefStatus } from '@/lib/queries/briefs-mutate';
import {
  createPublicationAttempt,
  hasPublishedToChannel,
  listPublicationsForBrief,
  markPublicationFailed,
  markPublicationPublished,
} from '@/lib/queries/brief-publications';
import {
  BRIEF_SELECT_SQL,
  mapBriefRow,
  type BriefRow,
} from '@/lib/briefs/brief-row-mapper';
import type { BriefStatusT } from '@/lib/briefs/brief-types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  channel_id: z.string().uuid(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing brief id' }, { status: 400 });
  }

  try {
    const publications = await listPublicationsForBrief(id);
    return NextResponse.json({ publications });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[GET /api/briefs/[id]/publications]', message, err);
    return NextResponse.json(
      { error: `Failed to load publications: ${message}` },
      { status: 500 }
    );
  }
}

interface BriefLookupRow {
  status: BriefStatusT;
  draft_content: string | null;
}

interface ChannelLookupRow {
  id: string;
  name: string;
  platform: string;
  external_id: string;
  status: string;
  access_token_encrypted: Buffer | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing brief id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { channel_id } = parsed.data;

  try {
    // 1. Brief phải tồn tại, có nội dung, và đã qua review
    const briefResult = await db.query<BriefLookupRow>(
      `SELECT status, draft_content FROM briefs WHERE id = $1`,
      [id]
    );
    const briefRow = briefResult.rows[0];
    if (!briefRow) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
    }
    if (!briefRow.draft_content?.trim()) {
      return NextResponse.json(
        { error: 'Brief chưa có nội dung bài viết — viết bài trước khi đăng.' },
        { status: 400 }
      );
    }
    if (briefRow.status !== 'submitted' && briefRow.status !== 'published') {
      return NextResponse.json(
        { error: 'Chỉ đăng được brief đã submit review hoặc đã approve.' },
        { status: 400 }
      );
    }

    // 2. Kênh phải active, là Facebook Page, có token
    const channelResult = await db.query<ChannelLookupRow>(
      `SELECT id, name, platform::text AS platform, external_id,
              status::text AS status, access_token_encrypted
       FROM social_account
       WHERE id = $1`,
      [channel_id]
    );
    const channel = channelResult.rows[0];
    if (!channel) {
      return NextResponse.json({ error: 'Không tìm thấy kênh' }, { status: 404 });
    }
    if (channel.status !== 'active') {
      return NextResponse.json(
        { error: `Kênh "${channel.name}" đang không active.` },
        { status: 400 }
      );
    }
    if (channel.platform !== 'facebook') {
      return NextResponse.json(
        { error: 'Hiện chỉ hỗ trợ đăng lên Facebook Page. Các kênh khác sẽ có ở phase sau.' },
        { status: 400 }
      );
    }
    if (!channel.access_token_encrypted) {
      return NextResponse.json(
        { error: `Kênh "${channel.name}" chưa có token — kết nối lại ở trang Channels.` },
        { status: 400 }
      );
    }

    // 3. Chặn đăng trùng — 1 brief chỉ đăng thành công 1 lần / kênh
    if (await hasPublishedToChannel(id, channel_id)) {
      return NextResponse.json(
        { error: `Brief này đã đăng lên "${channel.name}" rồi.` },
        { status: 409 }
      );
    }

    // 4. Ghi attempt trước, gọi FB sau — chết giữa chừng vẫn còn vết đối chiếu
    const publicationId = await createPublicationAttempt(id, channel_id, user.userId);

    try {
      const token = await decryptToken(channel.access_token_encrypted);
      const result = await publishPagePost(
        token,
        channel.external_id,
        briefRow.draft_content
      );

      const publication = await markPublicationPublished(
        publicationId,
        result.postId,
        result.permalinkUrl
      );

      const actor = { member_id: user.userId, name: user.name };
      await logActivity({
        brief_id: id,
        action: 'published_to_channel',
        actor_member_id: actor.member_id,
        actor_name: actor.name,
        detail: `đăng bài lên "${channel.name}"${
          result.permalinkUrl ? ` — ${result.permalinkUrl}` : ''
        }`,
      });

      // Auto-chuyển status sang published (kèm log status_changed) nếu chưa
      let brief;
      if (briefRow.status !== 'published') {
        brief = await updateBriefStatus(id, 'published', actor);
      } else {
        const fullResult = await db.query<BriefRow>(
          `${BRIEF_SELECT_SQL} WHERE b.id = $1`,
          [id]
        );
        const fullRow = fullResult.rows[0];
        brief = fullRow ? mapBriefRow(fullRow) : null;
      }

      return NextResponse.json({ publication, brief });
    } catch (publishErr) {
      const message =
        publishErr instanceof Error ? publishErr.message : 'Unknown publish error';
      await markPublicationFailed(publicationId, message);

      if (publishErr instanceof TokenExpiredError) {
        return NextResponse.json(
          { error: `Token của kênh "${channel.name}" đã hết hạn — vào trang Channels kết nối lại.` },
          { status: 502 }
        );
      }
      console.error('[POST /api/briefs/[id]/publications] publish failed:', message);
      return NextResponse.json(
        { error: `Đăng thất bại: ${message}` },
        { status: 502 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[POST /api/briefs/[id]/publications]', message, err);
    return NextResponse.json(
      { error: `Failed to publish: ${message}` },
      { status: 500 }
    );
  }
}
