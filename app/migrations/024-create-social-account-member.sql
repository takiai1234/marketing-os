-- Migration 024: Many-to-many social_account ↔ team_member với role
-- Up migration
--
-- Mục tiêu: 1 kênh có thể có nhiều người phụ trách. 2 role:
--   primary — 100% KPI credit (MAX 1 primary / channel — enforced bằng
--             partial UNIQUE INDEX bên dưới + API validation layer 2)
--   editor  — 0 KPI nhưng visible trong "kênh đang quản" tags với suffix
--             " · editor" để admin biết ai assist
--
-- Quy tắc A + B2 (chốt trong chat):
--   A  = primary 100%, editor 0 (không split, math = single-owner cũ)
--   B2 = editor vẫn hiện trong tags (chỉ KPI = 0)
--
-- Tương thích ngược: cột social_account.owner_member_id GIỮ NGUYÊN làm
-- "denormalized primary" cho các query cũ. API code đảm bảo sync — mỗi
-- khi đổi member list, owner_member_id = primary member (hoặc NULL).

CREATE TABLE IF NOT EXISTS social_account_member (
  account_id  UUID NOT NULL REFERENCES social_account(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES team_member(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'editor')),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, member_id)
);

-- Index cho query "kênh của member X" — team_kpi dùng heavy
CREATE INDEX IF NOT EXISTS social_account_member_member_idx
  ON social_account_member (member_id, role);

-- ENFORCE max 1 primary per channel ở DB level — partial UNIQUE INDEX.
-- Bất kỳ INSERT/UPDATE nào tạo ra 2 row cùng account_id với role='primary'
-- sẽ throw 23505 unique_violation. API code catch + return 400 friendly,
-- nhưng nếu code bypass thì DB vẫn từ chối.
CREATE UNIQUE INDEX IF NOT EXISTS social_account_member_one_primary_idx
  ON social_account_member (account_id)
  WHERE role = 'primary';

-- Backfill từ owner_member_id hiện tại: mỗi owner cũ → primary role.
-- ON CONFLICT DO NOTHING: idempotent khi rerun migration.
-- Backfill chỉ tạo 1 primary per channel (vì owner_member_id là single column)
-- → không vi phạm partial unique index ở trên.
INSERT INTO social_account_member (account_id, member_id, role)
SELECT id, owner_member_id, 'primary'
FROM social_account
WHERE owner_member_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON TABLE social_account_member IS
  'Many-to-many: 1 kênh có N member, MAX 1 primary (Rule A). primary = 100% KPI; editor = 0 KPI nhưng hiện trong tags (B2). social_account.owner_member_id là denormalized primary cho backwards compat.';
COMMENT ON COLUMN social_account_member.role IS
  'primary = 100% KPI của kênh (max 1/channel); editor = 0 KPI nhưng hiện trong tags (B2 rule).';
