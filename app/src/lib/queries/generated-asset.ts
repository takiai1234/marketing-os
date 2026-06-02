// DB queries cho generated_asset table.
// Privacy: user chỉ thấy assets của chính mình (filter user_id).

import { db } from '@/lib/db';

export type AssetType = 'image' | 'video';
export type AssetStatus = 'pending' | 'running' | 'success' | 'failed';

export interface GeneratedAsset {
  id: string;
  skillId: string | null;
  userId: string;
  assetType: AssetType;
  model: string;
  prompt: string;
  inputParams: Record<string, unknown>;
  taskId: string | null;
  status: AssetStatus;
  resultUrl: string | null;
  rawResponse: unknown;
  errorMessage: string | null;
  costCredits: number | null;
  createdAt: string;
  completedAt: string | null;
}

function mapRow(row: {
  id: string;
  skill_id: string | null;
  user_id: string;
  asset_type: AssetType;
  model: string;
  prompt: string;
  input_params: Record<string, unknown> | null;
  task_id: string | null;
  status: AssetStatus;
  result_url: string | null;
  raw_response: unknown;
  error_message: string | null;
  cost_credits: string | null;
  created_at: string;
  completed_at: string | null;
}): GeneratedAsset {
  return {
    id: row.id,
    skillId: row.skill_id,
    userId: row.user_id,
    assetType: row.asset_type,
    model: row.model,
    prompt: row.prompt,
    inputParams: row.input_params ?? {},
    taskId: row.task_id,
    status: row.status,
    resultUrl: row.result_url,
    rawResponse: row.raw_response,
    errorMessage: row.error_message,
    costCredits: row.cost_credits !== null ? Number(row.cost_credits) : null,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export interface CreateAssetInput {
  skillId: string | null;
  userId: string;
  assetType: AssetType;
  model: string;
  prompt: string;
  inputParams: Record<string, unknown>;
}

export async function createAsset(input: CreateAssetInput): Promise<GeneratedAsset> {
  const res = await db.query(
    `INSERT INTO generated_asset
       (skill_id, user_id, asset_type, model, prompt, input_params, status)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending')
     RETURNING *`,
    [
      input.skillId,
      input.userId,
      input.assetType,
      input.model,
      input.prompt,
      JSON.stringify(input.inputParams),
    ]
  );
  return mapRow(res.rows[0]);
}

export async function setAssetTaskId(
  assetId: string,
  taskId: string,
  rawResponse: unknown
): Promise<void> {
  await db.query(
    `UPDATE generated_asset
        SET task_id = $2, raw_response = $3::jsonb, status = 'running'
      WHERE id = $1`,
    [assetId, taskId, JSON.stringify(rawResponse)]
  );
}

export async function updateAssetStatus(
  assetId: string,
  patch: {
    status: AssetStatus;
    resultUrl?: string | null;
    errorMessage?: string | null;
    costCredits?: number | null;
    rawResponse?: unknown;
  }
): Promise<void> {
  await db.query(
    `UPDATE generated_asset
        SET status = $2,
            result_url = COALESCE($3, result_url),
            error_message = COALESCE($4, error_message),
            cost_credits = COALESCE($5::NUMERIC, cost_credits),
            raw_response = COALESCE($6::jsonb, raw_response),
            completed_at = CASE WHEN $2 IN ('success','failed') THEN NOW() ELSE completed_at END
      WHERE id = $1`,
    [
      assetId,
      patch.status,
      patch.resultUrl ?? null,
      patch.errorMessage ?? null,
      patch.costCredits ?? null,
      patch.rawResponse ? JSON.stringify(patch.rawResponse) : null,
    ]
  );
}

export async function getAssetForUser(
  assetId: string,
  userId: string
): Promise<GeneratedAsset | null> {
  const res = await db.query(
    `SELECT * FROM generated_asset WHERE id = $1 AND user_id = $2`,
    [assetId, userId]
  );
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0]);
}

export async function listAssetsForSkill(
  skillId: string | null,
  userId: string,
  limit = 30
): Promise<GeneratedAsset[]> {
  // skillId NULL → "tất cả assets của user" (vd khi mở generate page độc lập)
  const res = skillId
    ? await db.query(
        `SELECT * FROM generated_asset
          WHERE user_id = $1 AND skill_id = $2
          ORDER BY created_at DESC LIMIT $3`,
        [userId, skillId, limit]
      )
    : await db.query(
        `SELECT * FROM generated_asset
          WHERE user_id = $1
          ORDER BY created_at DESC LIMIT $2`,
        [userId, limit]
      );
  return res.rows.map(mapRow);
}

export async function deleteAsset(
  assetId: string,
  userId: string
): Promise<boolean> {
  const res = await db.query(
    `DELETE FROM generated_asset WHERE id = $1 AND user_id = $2`,
    [assetId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}
