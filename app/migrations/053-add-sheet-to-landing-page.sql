-- Migration 053: Thêm Google Sheet config vào landing_page
ALTER TABLE landing_page
  ADD COLUMN IF NOT EXISTS sheet_id   TEXT,  -- Google Spreadsheet ID
  ADD COLUMN IF NOT EXISTS sheet_name TEXT;  -- Tên tab, VD: 'Sheet1'
