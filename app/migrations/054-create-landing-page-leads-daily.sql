-- Migration 054: Bảng leads theo ngày từ Google Sheet
CREATE TABLE IF NOT EXISTS landing_page_leads_daily (
  landing_page_id UUID NOT NULL REFERENCES landing_page(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  leads           INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (landing_page_id, date)
);
