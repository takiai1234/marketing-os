// Health warnings + pacing computation cho campaign performance.
// Pure function utilities — no DB, no FB API. Compute từ data đã pull.
//
// Thresholds chọn theo industry benchmarks chung. Có thể fine-tune sau
// khi có baseline data thực tế của user.

export interface HealthWarning {
  level: 'critical' | 'warning' | 'info' | 'success';
  code: string;     // máy đọc (cho i18n / analytics)
  label: string;    // hiển thị UI (tiếng Việt)
  hint: string;     // mô tả ngắn + suggested action
}

export interface HealthCheckInput {
  spendMicros: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  ctr: number;             // 0..1
  frequency: number;       // impressions/reach
  cpmMicros: number;
  daysWithData: number;
}

/** Compute warnings cho 1 campaign từ 30d aggregates. Trả max ~4 warnings
 *  (top priority first). UI hiện 1-2 đầu để không clutter. */
export function computeHealthWarnings(input: HealthCheckInput): HealthWarning[] {
  const warnings: HealthWarning[] = [];

  // Critical: ad fatigue (cùng user thấy quá nhiều lần)
  if (input.frequency >= 3) {
    warnings.push({
      level: 'critical',
      code: 'ad_fatigue',
      label: '🔥 Ad fatigue',
      hint: `Frequency ${input.frequency.toFixed(1)} (>3) — user xem ad quá nhiều lần. Đổi creative hoặc rotate.`,
    });
  } else if (input.frequency >= 2) {
    warnings.push({
      level: 'warning',
      code: 'frequency_high',
      label: '⚠️ Frequency cao',
      hint: `Frequency ${input.frequency.toFixed(1)} — sắp chạm ngưỡng fatigue. Chuẩn bị creative mới.`,
    });
  }

  // Critical: spend nhiều nhưng 0 conversion
  // Trigger nếu 30d spend > 500K đồng (~$20) mà 0 conv
  // Note: spendMicros / 1_000_000 ra đơn vị nguyên (VND đồng hoặc USD).
  const spendUnit = input.spendMicros / 1_000_000;
  if (spendUnit > 500_000 && input.conversions === 0) {
    warnings.push({
      level: 'critical',
      code: 'no_conversion',
      label: '🚨 0 conversion sau 500K spend',
      hint: 'Check FB pixel installed, conversion event setup, landing page UX, offer hấp dẫn.',
    });
  }

  // Warning: CTR thấp (creative chưa hook)
  // Benchmark: >1% là acceptable, >2% là tốt, <0.5% là cảnh báo
  if (input.impressions >= 1000 && input.ctr < 0.005) {
    warnings.push({
      level: 'warning',
      code: 'low_ctr',
      label: '⚠️ CTR thấp',
      hint: `CTR ${(input.ctr * 100).toFixed(2)}% (<0.5%) — creative chưa hook. Test headline + visual mới.`,
    });
  }

  // Info: CPM cao (audience saturated hoặc bid cao)
  // Threshold tương đối — VND CPM thường 20-100K, USD 5-20$.
  // Dùng spendUnit/impressions × 1000 = CPM trong unit cùng currency.
  const cpmUnit = input.cpmMicros / 1_000_000;
  if (cpmUnit > 100_000) {
    // VND scale — CPM > 100K đồng / 1000 imp là cao
    warnings.push({
      level: 'warning',
      code: 'high_cpm',
      label: '⚠️ CPM cao',
      hint: 'Audience có thể đã saturated hoặc bid cao. Expand targeting hoặc giảm bid.',
    });
  }

  // Success: high performer (xanh để khuyến khích scale)
  if (input.conversions >= 10 && input.ctr > 0.02 && input.frequency < 2) {
    warnings.push({
      level: 'success',
      code: 'top_performer',
      label: '✨ Top performer',
      hint: 'CTR cao + nhiều conv + frequency thấp — cân nhắc tăng budget hoặc duplicate.',
    });
  }

  return warnings;
}

// ─── Pacing ──────────────────────────────────────────────────────────────

export interface PacingInfo {
  /** Total budget (daily × duration HOẶC lifetime). 0 nếu không set. */
  budgetMicros: number;
  /** Đã chi (cumulative spend 30d). */
  spentMicros: number;
  /** % budget đã chi (0-100, capped ở 999% cho overspend visualization) */
  percentSpent: number;
  /** Số ngày campaign đã chạy */
  daysRun: number;
  /** Số ngày còn lại (nếu có endTime). null nếu evergreen (no end). */
  daysRemaining: number | null;
  /** Daily avg spend = spentMicros / daysRun */
  avgDailySpendMicros: number;
  /** Projected total spend nếu pace giữ nguyên = avgDaily × (daysRun + daysRemaining) */
  projectedTotalMicros: number | null;
  /** 'on-pace' | 'over-pace' (sẽ vượt budget) | 'under-pace' | 'unknown' */
  status: 'on-pace' | 'over-pace' | 'under-pace' | 'unknown';
}

export interface PacingInput {
  spendMicros: number;
  dailyBudgetMicros: number | null;
  lifetimeBudgetMicros: number | null;
  startTime: string | null;
  endTime: string | null;
}

export function computePacing(input: PacingInput): PacingInfo {
  const now = Date.now();
  const start = input.startTime ? new Date(input.startTime).getTime() : null;
  const end = input.endTime ? new Date(input.endTime).getTime() : null;

  const daysRun = start
    ? Math.max(1, Math.ceil((now - start) / (24 * 60 * 60 * 1000)))
    : 30;
  const daysRemaining = end
    ? Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000)))
    : null;

  let budgetMicros = 0;
  if (input.lifetimeBudgetMicros) {
    budgetMicros = input.lifetimeBudgetMicros;
  } else if (input.dailyBudgetMicros) {
    const totalDays = daysRemaining !== null ? daysRun + daysRemaining : daysRun;
    budgetMicros = input.dailyBudgetMicros * totalDays;
  }

  const percentSpent = budgetMicros > 0
    ? Math.min(999, Math.round((input.spendMicros / budgetMicros) * 100))
    : 0;

  const avgDaily = Math.round(input.spendMicros / daysRun);
  const projected = daysRemaining !== null
    ? avgDaily * (daysRun + daysRemaining)
    : null;

  let status: PacingInfo['status'] = 'unknown';
  if (budgetMicros > 0 && projected !== null) {
    if (projected > budgetMicros * 1.1) status = 'over-pace';
    else if (projected < budgetMicros * 0.7) status = 'under-pace';
    else status = 'on-pace';
  }

  return {
    budgetMicros,
    spentMicros: input.spendMicros,
    percentSpent,
    daysRun,
    daysRemaining,
    avgDailySpendMicros: avgDaily,
    projectedTotalMicros: projected,
    status,
  };
}

// ─── Period compare helper ──────────────────────────────────────────────

export interface DeltaInfo {
  current: number;
  previous: number;
  delta: number;        // current - previous
  deltaPct: number;     // (current - previous) / previous × 100
  trend: 'up' | 'down' | 'flat';
}

/** Compute delta giữa 2 period. flat = ±5% threshold. */
export function computeDelta(current: number, previous: number): DeltaInfo {
  const delta = current - previous;
  const deltaPct = previous > 0 ? (delta / previous) * 100 : current > 0 ? 100 : 0;
  const trend: DeltaInfo['trend'] =
    Math.abs(deltaPct) < 5 ? 'flat' : delta > 0 ? 'up' : 'down';
  return { current, previous, delta, deltaPct, trend };
}
