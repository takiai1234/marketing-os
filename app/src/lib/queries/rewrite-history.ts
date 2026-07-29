import { db } from '@/lib/db';

export interface InsertRewriteHistoryInput {
  userId: string;
  userName: string;
  model: string;
  sourceType: string;
  sourceContext?: string | null;
  tone: string;
  platform: string;
  length: string;
  skillId?: string | null;
  skillName?: string | null;
  tokensIn: number;
  tokensOut: number;
  finishReason?: string | null;
}

export async function insertRewriteHistory(input: InsertRewriteHistoryInput): Promise<void> {
  await db.query(
    `INSERT INTO rewrite_history
       (user_id, user_name, model, source_type, source_context,
        tone, platform, length, skill_id, skill_name,
        tokens_in, tokens_out, finish_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      input.userId,
      input.userName,
      input.model,
      input.sourceType,
      input.sourceContext ?? null,
      input.tone,
      input.platform,
      input.length,
      input.skillId ?? null,
      input.skillName ?? null,
      input.tokensIn,
      input.tokensOut,
      input.finishReason ?? null,
    ]
  );
}

export interface RewriteHistoryRow {
  id: string;
  userId: string | null;
  userName: string | null;
  model: string;
  sourceType: string;
  sourceContext: string | null;
  tone: string;
  platform: string;
  length: string;
  skillId: string | null;
  skillName: string | null;
  tokensIn: number;
  tokensOut: number;
  finishReason: string | null;
  createdAt: string;
}

export interface RewriteHistoryResult {
  items: RewriteHistoryRow[];
  nextCursor: string | null;
}

const PAGE_SIZE = 50;

export async function listRewriteHistory(opts: {
  userId?: string;    // nếu có → chỉ lấy của user đó (non-admin self-view)
  cursor?: string | null;
}): Promise<RewriteHistoryResult> {
  const params: unknown[] = [PAGE_SIZE + 1];
  const where: string[] = [];

  if (opts.userId) {
    params.push(opts.userId);
    where.push(`user_id = $${params.length}`);
  }
  if (opts.cursor) {
    params.push(opts.cursor);
    where.push(`created_at < $${params.length}::timestamptz`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const res = await db.query<{
    id: string;
    user_id: string | null;
    user_name: string | null;
    model: string;
    source_type: string;
    source_context: string | null;
    tone: string;
    platform: string;
    length: string;
    skill_id: string | null;
    skill_name: string | null;
    tokens_in: number;
    tokens_out: number;
    finish_reason: string | null;
    created_at: Date;
  }>(
    `SELECT id, user_id, user_name, model, source_type, source_context,
            tone, platform, length, skill_id, skill_name,
            tokens_in, tokens_out, finish_reason, created_at
     FROM rewrite_history
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $1`,
    params
  );

  const rows = res.rows;
  const hasMore = rows.length > PAGE_SIZE;
  const items = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    model: r.model,
    sourceType: r.source_type,
    sourceContext: r.source_context,
    tone: r.tone,
    platform: r.platform,
    length: r.length,
    skillId: r.skill_id,
    skillName: r.skill_name,
    tokensIn: Number(r.tokens_in),
    tokensOut: Number(r.tokens_out),
    finishReason: r.finish_reason,
    createdAt: (r.created_at as Date).toISOString(),
  }));

  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? last.createdAt : null;

  return { items, nextCursor };
}
