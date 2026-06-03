-- Migration 038: Add Business Manager metadata vào ad_account
-- Up migration
--
-- Cho phép UI /ads group cards theo BM (vd "BM Client A" / "BM Client B")
-- thay vì flat list. Useful kể cả với agency nhỏ (3-5 client, mỗi client
-- 1-3 ad account).
--
-- Data lấy từ FB API: GET /me/adaccounts?fields=...,business{id,name}
-- - business_manager_id: numeric Business Manager ID
-- - business_manager_name: display name (có thể null nếu ad account personal)
--
-- Cả 2 nullable vì:
--   - Ad account personal (không thuộc BM) → null
--   - User chưa update từ migration 038 (data cũ) → null cho đến cron next run

ALTER TABLE ad_account
  ADD COLUMN IF NOT EXISTS business_manager_id   TEXT,
  ADD COLUMN IF NOT EXISTS business_manager_name TEXT;

-- Index cho group queries (ORDER BY BM name)
CREATE INDEX IF NOT EXISTS ad_account_owner_bm_idx
  ON ad_account (owner_id, business_manager_name NULLS LAST, name);

COMMENT ON COLUMN ad_account.business_manager_id IS
  'Numeric Business Manager ID từ FB. NULL = ad account personal hoặc legacy data.';
COMMENT ON COLUMN ad_account.business_manager_name IS
  'BM display name, dùng cho UI grouping. NULL fallback "Tài khoản cá nhân".';
