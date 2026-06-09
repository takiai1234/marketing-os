-- Migration 040: Channel tag — M:N social_account ↔ tag
--
-- Mục đích: chia kênh thành nhóm (AI / Minh Trí / Tool / ...) để filter
-- Dashboard tab. Tag MUTUALLY non-exclusive: 1 kênh có thể nhiều tag.
--
-- Tab "Tổng" trên dashboard hiển thị TẤT CẢ kênh (không filter tag).
-- Tab tag-cụ-thể chỉ hiển thị kênh có tag đó.
-- Kênh KHÔNG có tag nào → chỉ xuất hiện ở tab "Tổng" (bị mọi tab tag-specific
-- bỏ qua) — admin có incentive đi gán tag để kênh nổi trên dashboard chi tiết.
--
-- Admin CRUD tag qua /settings/channel-tags. Khi xoá tag, DELETE CASCADE
-- xoá tất cả mapping trong social_account_tag — kênh không bị xoá, chỉ bị
-- bóc tag đó.

CREATE TABLE IF NOT EXISTS channel_tag (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Display name — admin có thể sửa, không cần unique (slug đảm bảo unique).
  name        TEXT NOT NULL,
  -- URL slug + cache key — admin tạo lần đầu, KHÔNG được đổi vì dashboard
  -- URL bookmark phụ thuộc (?tag=ai). Format: lowercase a-z0-9-.
  slug        TEXT NOT NULL UNIQUE,
  -- Thứ tự hiển thị tab trên dashboard. Smaller = lên trước.
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_account_tag (
  account_id  UUID NOT NULL REFERENCES social_account(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES channel_tag(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, tag_id)
);

-- Index ngược cho "cho 1 tag, list mọi kênh" — dashboard queries dùng.
CREATE INDEX IF NOT EXISTS social_account_tag_tag_idx
  ON social_account_tag (tag_id);

-- Seed 3 tag mặc định — admin có thể sửa name hoặc thêm tag mới.
-- ON CONFLICT DO NOTHING để idempotent rerun migration.
INSERT INTO channel_tag (name, slug, sort_order) VALUES
  ('AI',        'ai',        1),
  ('Minh Trí',  'minh-tri',  2),
  ('Tool',      'tool',      3)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE channel_tag IS
  'Tag để nhóm kênh (M:N với social_account). Dashboard tab filter theo slug.';
COMMENT ON TABLE social_account_tag IS
  'Mapping M:N kênh ↔ tag. 1 kênh có thể nhiều tag; tag bị xoá → cascade.';
