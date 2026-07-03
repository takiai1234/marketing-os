-- Migration 055: Thêm bộ lọc Nguồn cho Google Sheet
ALTER TABLE landing_page
  ADD COLUMN IF NOT EXISTS sheet_source_filter TEXT,  -- VD: 'aiplus.vn', 'facebook', ...
  ADD COLUMN IF NOT EXISTS sheet_source_column TEXT DEFAULT 'E';  -- Cột Nguồn, mặc định E
