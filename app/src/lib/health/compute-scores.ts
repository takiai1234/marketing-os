// Pure functions for computing Facebook Page health sub-scores and final health score.
// All scores are in range 0-100. No DB access — easy to unit test.
//
// Formula weights: health = (2/9)×er + (1/6)×consistency + (1/9)×growth + 0.5×reach
// Reach = 50% (chiếm trọng số chính), 50% còn lại giữ tỷ lệ cũ 4:3:2 cho ER/Consistency/Growth.
//
// Benchmarks dựa trên industry FB Page lớn (2024-2025):
//   - ER trung bình: 0.5-3% → benchmark 3%
//   - Reach rate trung bình: 10-30%/ngày → target 30%
//   - Growth: ±5%/tuần là biên độ thực tế cho page healthy

/** Clamp a number to [min, max] inclusive. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * ER score from last-30d average engagement_rate.
 * Industry benchmark cho FB Page lớn: 0.5-3% → dùng 3% làm "perfect score" mặc định.
 *
 * Formula: clamp((avgER / benchmark) * 100, 0, 100)
 *
 * @param avgEngagementRate - Trung bình ER 30d, dạng decimal 0..1 (vd 0.025 = 2.5%)
 *                            Lấy từ DB GENERATED column `post_metric_daily.engagement_rate`
 * @param benchmark - ER target đạt 100đ, default 0.03 (3%)
 * @returns score 0-100
 */
export function erScore(avgEngagementRate: number, benchmark = 0.03): number {
  if (benchmark <= 0) return 0;
  return clamp((avgEngagementRate / benchmark) * 100, 0, 100);
}

/**
 * Consistency score based on post count in the last 7 days.
 * Target default is 7 posts/week (1/day). Linear scale up to target = 100.
 *
 * Formula: clamp((postsLast7d / target) * 100, 0, 100)
 *
 * @param postsLast7d - Số bài đăng 7 ngày gần nhất
 * @param target - Số bài/tuần đạt 100đ, default 7
 * @returns score 0-100
 */
export function consistencyScore(postsLast7d: number, target = 7): number {
  if (target <= 0) return 0;
  return clamp((postsLast7d / target) * 100, 0, 100);
}

/**
 * Growth score based on follower change over last 7 days.
 * Normalize theo maxPct: ±maxPct% = full range (0 or 100), 0% change = 50 (neutral).
 *
 * Formula: clamp((pctChange / maxPct) * 50 + 50, 0, 100)
 *   - pctChange = -maxPct → 0  (lose followers fast)
 *   - pctChange =  0      → 50 (no change, neutral)
 *   - pctChange = +maxPct → 100 (grow fast)
 *
 * @param followersToday - Số follower hiện tại
 * @param followers7dAgo - Số follower 7 ngày trước
 * @param maxPct - % thay đổi/tuần để đạt full range, default 5
 * @returns score 0-100; neutral=50 khi followers7dAgo<=0 (không tính được)
 */
export function growthScore(
  followersToday: number,
  followers7dAgo: number,
  maxPct = 5
): number {
  if (followers7dAgo <= 0) return 50;
  if (maxPct <= 0) return 50;
  const pctChange = ((followersToday - followers7dAgo) / followers7dAgo) * 100;
  return clamp((pctChange / maxPct) * 50 + 50, 0, 100);
}

/**
 * Reach score based on Reach Rate = avgDailyReach / totalFollowers.
 * Fair với mọi size page: kênh 1k follower đạt 300 reach/day = full score,
 * tương đương kênh 100k follower đạt 30k reach/day.
 *
 * Industry benchmark FB Page: 10-30% reach rate/day → dùng 30% làm target mặc định.
 *
 * Formula: clamp((reachRate / targetRate) * 100, 0, 100)
 *   với reachRate = avgDailyReach / totalFollowers
 *
 * @param avgDailyReach - Trung bình reach/ngày 30d, từ `account_metric_daily.total_reach`
 * @param totalFollowers - Số follower hiện tại (mẫu số để chuẩn hoá rate)
 * @param targetRate - Reach rate đạt 100đ, default 0.30 (30%)
 * @returns score 0-100; return 0 nếu totalFollowers<=0 (không tính được rate)
 */
export function reachScore(
  avgDailyReach: number,
  totalFollowers: number,
  targetRate = 0.30
): number {
  if (totalFollowers <= 0 || targetRate <= 0) return 0;
  const reachRate = avgDailyReach / totalFollowers;
  return clamp((reachRate / targetRate) * 100, 0, 100);
}

export interface HealthInputScores {
  er: number;
  consistency: number;
  growth: number;
  reach: number;
}

/**
 * Compute final health score from 4 sub-scores (each 0-100).
 * Weights: (2/9) ER + (1/6) consistency + (1/9) growth + 0.5 reach.
 * Reach dominant (50%), 50% còn lại giữ tỷ lệ 4:3:2 cho ER/Consistency/Growth.
 * Result rounded to 2 decimal places.
 */
export function computeHealthScore({ er, consistency, growth, reach }: HealthInputScores): number {
  const raw = (2 / 9) * er + (1 / 6) * consistency + (1 / 9) * growth + 0.5 * reach;
  return Math.round(raw * 100) / 100;
}
