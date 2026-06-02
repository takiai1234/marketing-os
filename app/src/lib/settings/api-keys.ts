// App-level encrypted settings (mostly API keys cho 3rd party services).
// Reuse pgcrypto pattern giống FB token encryption.
//
// Convention: keys luôn UPPERCASE_SNAKE_CASE để giống env var (interchangeable).

import { db } from '@/lib/db';

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set');
  return key;
}

/**
 * Get decrypted setting value. Returns null nếu chưa set hoặc decrypt fail
 * (vd ENCRYPTION_KEY thay đổi sau khi save).
 */
export async function getSetting(key: string): Promise<string | null> {
  try {
    const res = await db.query<{ plain: string | null }>(
      `SELECT pgp_sym_decrypt(value_enc, $2::text)::text AS plain
         FROM app_setting
        WHERE key = $1`,
      [key, getEncryptionKey()]
    );
    return res.rows[0]?.plain ?? null;
  } catch (err) {
    console.error(`[getSetting] Failed to decrypt key=${key}:`, err);
    return null;
  }
}

/**
 * Helper hybrid: ưu tiên DB → fallback env var.
 * Cho phép env var làm "default" + admin override qua UI.
 * Ví dụ: deploy với env trong .env.production, sau admin có thể paste
 * key khác qua UI mà không cần redeploy.
 */
export async function getSettingOrEnv(key: string): Promise<string | null> {
  const dbValue = await getSetting(key);
  if (dbValue) return dbValue;
  return process.env[key] ?? null;
}

export async function setSetting(
  key: string,
  value: string,
  updatedBy: string,
  description?: string
): Promise<void> {
  await db.query(
    `INSERT INTO app_setting (key, value_enc, description, updated_by)
     VALUES ($1, pgp_sym_encrypt($2::text, $3::text), $4, $5)
     ON CONFLICT (key) DO UPDATE
       SET value_enc = EXCLUDED.value_enc,
           description = COALESCE(EXCLUDED.description, app_setting.description),
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by`,
    [key, value, getEncryptionKey(), description ?? null, updatedBy]
  );
}

export async function deleteSetting(key: string): Promise<boolean> {
  const res = await db.query(`DELETE FROM app_setting WHERE key = $1`, [key]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Lấy metadata về key đã set — KHÔNG decrypt value. Dùng cho UI hiển thị
 * "đã set / chưa set" + audit info mà không phải reveal plaintext.
 */
export interface SettingMetadata {
  key: string;
  isSet: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
}

export async function listSettingsMetadata(
  keys: string[]
): Promise<SettingMetadata[]> {
  if (keys.length === 0) return [];

  const res = await db.query<{
    key: string;
    updated_at: string;
    updated_by_name: string | null;
  }>(
    `SELECT s.key, s.updated_at::TEXT, tm.name AS updated_by_name
       FROM app_setting s
       LEFT JOIN team_member tm ON tm.id = s.updated_by
      WHERE s.key = ANY($1::TEXT[])`,
    [keys]
  );

  // Build lookup, fill in unset keys
  const byKey = new Map(
    res.rows.map((r) => [r.key, { updated_at: r.updated_at, updated_by_name: r.updated_by_name }])
  );

  return keys.map((k) => {
    const found = byKey.get(k);
    return {
      key: k,
      isSet: Boolean(found),
      updatedAt: found?.updated_at ?? null,
      updatedByName: found?.updated_by_name ?? null,
    };
  });
}

/**
 * Mask 1 secret để hiển thị an toàn ("sk-ant-...abcd").
 * Cần 4-8 ký tự đầu + 4 ký tự cuối + dấu *** ở giữa.
 */
export function maskSecret(value: string): string {
  if (value.length < 12) return '***';
  const prefix = value.slice(0, 8);
  const suffix = value.slice(-4);
  return `${prefix}***${suffix}`;
}
