-- Migration 048: Kênh nhập số liệu thủ công.
--
-- Cho phép tạo "kênh thủ công" (vd Facebook cá nhân — Meta không cho API đọc
-- profile) để nhập tay followers/reach/engagement vào account_metric_daily.
-- Dashboard/KPI/Total Reach tự gồm vì đều đọc bảng đó.
--
-- is_manual=true → cron sync bỏ qua (không có token/Bundle), và reach được xử
-- lý kiểu SNAPSHOT tuyệt đối (giống Bundle) thay vì daily-delta của FB —
-- vì admin nhập "tổng hiện tại" mỗi lần.
ALTER TABLE social_account
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN social_account.is_manual IS
  'Kênh nhập số liệu thủ công (không token/Bundle). Cron bỏ qua; reach tính snapshot tuyệt đối.';
