-- Migration 051: Landing pages + GA4 sessions tracking
-- Mục đích: track sessions từ GA4 per landing page, ghép với leads từ n8n
-- để tính tỉ lệ chuyển đổi (leads / sessions × 100%)

-- 1. Thêm 'website' vào platform_t enum
ALTER TYPE platform_t ADD VALUE IF NOT EXISTS 'website';

-- 2. Thêm sync_type cho GA4 job
ALTER TYPE sync_type_t ADD VALUE IF NOT EXISTS 'ga4_sync';

-- 3. Bảng quản lý landing pages (single-tenant — không cần team FK)
CREATE TABLE IF NOT EXISTS landing_page (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  page_path       TEXT NOT NULL,        -- VD: '/san-pham/ai-power' hoặc '/'
  ga4_property_id TEXT NOT NULL,        -- VD: '362645470' (numeric property ID)
  -- Link về social_account (Facebook page) để ghép lead từ landing_page_conversion
  account_id      UUID REFERENCES social_account(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ga4_property_id, page_path)
);

-- 4. Sessions theo ngày từ GA4
CREATE TABLE IF NOT EXISTS landing_page_daily (
  landing_page_id UUID NOT NULL REFERENCES landing_page(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  sessions        INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (landing_page_id, date)
);

CREATE INDEX IF NOT EXISTS idx_landing_page_daily_date
  ON landing_page_daily (date DESC);

-- 5. Key lưu Google OAuth credentials trong app_setting:
--    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
