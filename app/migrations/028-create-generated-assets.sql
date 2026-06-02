-- Migration 028: Generated assets (image + video) qua kie.ai
-- Up migration
--
-- 1 row = 1 lần generate. Track full lifecycle: create → polling → success/fail.
-- Result URL ban đầu trỏ về kie.ai CDN; sau này có thể download về
-- /app/storage/generated/<id>.{png,mp4} để giữ vĩnh viễn (tránh expire).
--
-- Cost tracking per row → admin sang /skills/[id]/generate sẽ thấy tổng chi
-- tiêu trên image/video.

CREATE TYPE asset_type_t AS ENUM ('image', 'video');
CREATE TYPE asset_status_t AS ENUM ('pending', 'running', 'success', 'failed');

CREATE TABLE IF NOT EXISTS generated_asset (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Liên kết tới skill nếu generate từ context skill nào đó. NULL khi
  -- generate độc lập (vd user mở /generate trực tiếp, chưa wire trong UI).
  skill_id      UUID REFERENCES skill_lib(id) ON DELETE SET NULL,
  user_id       UUID NOT NULL REFERENCES team_member(id) ON DELETE CASCADE,
  asset_type    asset_type_t NOT NULL,
  -- Model slug — vd "gpt-image-2-text-to-image", "grok-imagine/text-to-video"
  model         TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  -- input params bonus (aspect_ratio, resolution, duration, etc.) — JSONB
  -- vì mỗi model có schema khác. Lưu raw để debug + reproduce.
  input_params  JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- kie.ai trả về sau POST /jobs/createTask
  task_id       TEXT,
  status        asset_status_t NOT NULL DEFAULT 'pending',
  -- URL kết quả (kie.ai CDN). NULL khi chưa xong / failed.
  -- Có thể là 1 URL (video, single image) hoặc concat nhiều URLs (vd
  -- Midjourney trả 4 variants — store all URLs separated by newline).
  result_url    TEXT,
  -- Lưu raw response cuối cùng để debug nếu UI thấy sai data
  raw_response  JSONB,
  -- Error message khi failed
  error_message TEXT,
  -- Tokens / cost — kie.ai trả về trong task detail (nếu có)
  cost_credits  NUMERIC(10, 4),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- "Lịch sử của user X cho skill Y" — sidebar trên /generate page
CREATE INDEX IF NOT EXISTS generated_asset_user_skill_idx
  ON generated_asset (user_id, skill_id, created_at DESC);

-- Polling endpoint dùng để query theo task_id (kie.ai task)
CREATE INDEX IF NOT EXISTS generated_asset_task_idx
  ON generated_asset (task_id) WHERE task_id IS NOT NULL;

-- Status filter (vd "show running tasks" cho dashboard)
CREATE INDEX IF NOT EXISTS generated_asset_status_idx
  ON generated_asset (status, created_at DESC)
  WHERE status IN ('pending', 'running');

COMMENT ON TABLE generated_asset IS
  'Image + video assets sinh ra qua kie.ai. Lifecycle: create → poll → success. result_url trỏ về kie.ai CDN ban đầu, có thể download về storage sau.';
