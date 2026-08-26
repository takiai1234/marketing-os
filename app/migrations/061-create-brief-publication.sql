-- Migration 061: Brief publication — đăng bài từ brief lên kênh social.
-- Mỗi row = 1 lần đăng (attempt) 1 brief lên 1 kênh. Giữ cả lần fail để debug.
-- Phase 1 chỉ hỗ trợ Facebook Page (đăng trực tiếp qua Graph API);
-- các platform khác sẽ đi qua Bundle.social ở phase sau — schema không đổi.

-- ─── Enum status ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE brief_publication_status_t AS ENUM (
    'publishing',   -- đang gọi API platform
    'published',    -- đăng thành công, có external_post_id
    'failed'        -- API trả lỗi — xem error_message
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Bảng publication ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brief_publication (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id                UUID NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  social_account_id       UUID NOT NULL REFERENCES social_account(id) ON DELETE CASCADE,
  status                  brief_publication_status_t NOT NULL DEFAULT 'publishing',
  -- ID bài viết platform trả về (VD "pageid_postid" của FB)
  external_post_id        TEXT,
  permalink_url           TEXT,
  error_message           TEXT,
  -- Snapshot người bấm đăng — SET NULL nếu member bị xoá
  published_by_member_id  UUID REFERENCES team_member(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_brief_publication_brief_created
  ON brief_publication (brief_id, created_at DESC);

-- ─── Activity action mới ───────────────────────────────────────────────────────
-- ALTER TYPE ... ADD VALUE phải đứng riêng, không nằm trong DO block (xem 021)
ALTER TYPE brief_activity_action_t ADD VALUE IF NOT EXISTS 'published_to_channel';
