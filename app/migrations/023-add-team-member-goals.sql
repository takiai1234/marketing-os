-- Migration 023: Per-member 30-day goals (Follow growth, Reach, Posts per channel)
-- Up migration
--
-- Context: Admin muốn set mục tiêu kết quả cho từng nhân viên — đo bằng
-- delta giữa actual vs target. Phase 1: fixed 30-day window (match existing
-- agg_30d query window). Phase 2 có thể thêm goal_period_days nếu cần
-- flexible weekly/quarterly.
--
-- Cột "posts_per_channel" là per-channel-they-manage:
--   actual = SUM(posts) / num_channels_managed
-- Vd: nhân viên A quản 3 page, target 30 posts/channel → expected total = 90.
-- Lý do per-channel (không per-member-total): nhân viên có 1 page vs 5 page
-- không thể cùng target tuyệt đối.

ALTER TABLE team_member
  ADD COLUMN IF NOT EXISTS goal_follow_growth_30d  INT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goal_reach_30d          BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS goal_posts_per_channel_30d INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN team_member.goal_follow_growth_30d IS
  'Target new followers gained across all managed channels in last 30 days. 0 = no target set.';
COMMENT ON COLUMN team_member.goal_reach_30d IS
  'Target total reach across all managed channels in last 30 days. 0 = no target set.';
COMMENT ON COLUMN team_member.goal_posts_per_channel_30d IS
  'Target posts per managed channel in last 30 days. Actual = posts_30d / num_channels. 0 = no target set.';
