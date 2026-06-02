-- Migration 037: Ad account / campaign / metrics — multi-platform foundation
-- Up migration
--
-- Schema design cho Phase 1 (FB Ads) nhưng FLEXIBLE để Phase 2 (TikTok)
-- + Phase 3 (Google Ads) tái sử dụng:
--   - ad_account.platform discriminator
--   - extra_metrics JSONB cho metric đặc thù platform
--   - currency + spend_micros (lưu micros giống Google convention để tránh
--     float rounding cho VND/USD; FB nhân 100, Google nhân 1_000_000 — convert
--     ở lib layer)
--
-- ad_account semantics:
--   - 1 user có nhiều ad_account
--   - Token ENCRYPTED (pgcrypto) tương tự social_account
--   - status: pending (chờ user confirm), active (cron sync), disconnected,
--     error (token expired)
--
-- ad_campaign + ad_metric_daily: chỉ ingest khi status='active'

CREATE TYPE ad_platform_t AS ENUM ('facebook', 'google', 'tiktok');
CREATE TYPE ad_account_status_t AS ENUM ('pending', 'active', 'disconnected', 'error');
CREATE TYPE ad_objective_t AS ENUM (
  'awareness', 'traffic', 'engagement', 'leads', 'app_promotion',
  'sales', 'video_views', 'messages', 'unknown'
);

-- ─── Ad account ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ad_account (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES team_member(id) ON DELETE CASCADE,
  platform        ad_platform_t NOT NULL,
  -- External account ID từ platform:
  --   FB: act_<numeric_id> hoặc <numeric_id> raw
  --   Google: customer ID (10 digits, no dashes)
  --   TikTok: advertiser_id
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  -- Currency ISO 4217 (vd "VND", "USD", "EUR")
  currency        TEXT NOT NULL DEFAULT 'VND',
  -- IANA timezone (vd "Asia/Ho_Chi_Minh") — FB trả timezone_name format này
  timezone        TEXT,
  -- Encrypted access token — pgcrypto pgp_sym_encrypt output (bytea).
  -- Cùng encryption key như social_account.access_token_encrypted.
  -- FB Ads dùng USER token (not page token) vì /me/adaccounts là user-scoped.
  encrypted_token BYTEA,
  status          ad_account_status_t NOT NULL DEFAULT 'pending',
  -- Time-zone aware — khi user confirm/disconnect
  connected_at    TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_synced_at  TIMESTAMPTZ,
  -- Free-text error message khi sync fail (vd "Token revoked", "Account closed")
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unique constraint: 1 ad account không bị thêm 2 lần cho cùng user
  UNIQUE (owner_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS ad_account_owner_status_idx
  ON ad_account (owner_id, status, platform);

-- ─── Ad campaign ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ad_campaign (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id   UUID NOT NULL REFERENCES ad_account(id) ON DELETE CASCADE,
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  objective       ad_objective_t NOT NULL DEFAULT 'unknown',
  -- FB status: ACTIVE / PAUSED / DELETED / ARCHIVED → simplify thành text
  status          TEXT NOT NULL DEFAULT 'unknown',
  -- Budget in MICROS (cents × 100 for cleaner integer math).
  -- FB returns "10000" for $100 (cents); store as 10000_00 micros.
  -- Google returns micros natively.
  daily_budget_micros    BIGINT,
  lifetime_budget_micros BIGINT,
  start_time      TIMESTAMPTZ,
  end_time        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, external_id)
);

CREATE INDEX IF NOT EXISTS ad_campaign_account_status_idx
  ON ad_campaign (ad_account_id, status);

-- ─── Ad metric daily ─────────────────────────────────────────────────────
--
-- 1 row per (campaign|ad, date). campaign_id nullable cho account-level
-- summary rows (whose campaign_id IS NULL).
--
-- Có thể store ad-level chi tiết qua ad_external_id (text) — KHÔNG dùng
-- bảng ad riêng vì Phase 1 không cần granularity đó. Sau này extend dễ.

CREATE TABLE IF NOT EXISTS ad_metric_daily (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id   UUID NOT NULL REFERENCES ad_account(id) ON DELETE CASCADE,
  -- NULL → account-level aggregate cho ngày đó
  campaign_id     UUID REFERENCES ad_campaign(id) ON DELETE CASCADE,
  -- Optional ad-level granularity (FB ad_id, Google ad_id, etc.) — text
  -- vì không phải mọi platform có UUID/internal mapping.
  ad_external_id  TEXT,
  date            DATE NOT NULL,
  -- Currency dollar amount × 1_000_000 (micros). 1 VND = 1_000_000 micros.
  spend_micros    BIGINT NOT NULL DEFAULT 0,
  -- Đếm impression, reach (unique users), clicks, conversions
  impressions     BIGINT NOT NULL DEFAULT 0,
  reach           BIGINT NOT NULL DEFAULT 0,
  clicks          BIGINT NOT NULL DEFAULT 0,
  conversions     BIGINT NOT NULL DEFAULT 0,
  -- Computed metrics — store FB/Google reported values trực tiếp để khớp
  -- dashboard native. CPM/CPC = cost per 1000/click in micros.
  cpm_micros      BIGINT,
  cpc_micros      BIGINT,
  ctr             NUMERIC(8, 6),  -- 0.0123 = 1.23%
  -- ROAS = return on ad spend = revenue / spend. Lưu numeric thay micros
  -- vì là ratio.
  roas            NUMERIC(10, 4),
  -- Extra platform-specific metrics (Google: quality_score, TikTok:
  -- video_play_actions, FB: frequency, ...). Free-form JSONB.
  extra_metrics   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, campaign_id, ad_external_id, date)
);

CREATE INDEX IF NOT EXISTS ad_metric_daily_account_date_idx
  ON ad_metric_daily (ad_account_id, date DESC);
CREATE INDEX IF NOT EXISTS ad_metric_daily_campaign_date_idx
  ON ad_metric_daily (campaign_id, date DESC) WHERE campaign_id IS NOT NULL;

COMMENT ON TABLE ad_account IS
  'Ad accounts kết nối qua OAuth — FB Ads, Google Ads, TikTok Ads. Phase 1 chỉ FB.';
COMMENT ON TABLE ad_campaign IS
  'Campaign metadata pulled từ platform. Status text vì mỗi platform value khác.';
COMMENT ON TABLE ad_metric_daily IS
  'Daily metrics per campaign hoặc account (campaign_id IS NULL). Spend in micros.';
