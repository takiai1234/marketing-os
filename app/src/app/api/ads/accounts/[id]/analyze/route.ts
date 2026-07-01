// POST /api/ads/accounts/[id]/analyze
// Phân tích ad account theo framework "Meta Ads Profit Engine":
//   - Tính CPL trần từ kinh tế đơn vị (AOV × chốt × biên gộp)
//   - Lọc significance (≥30 kết quả hoặc chi ≥ 3×CPL trần)
//   - Báo cáo 7 phần theo report_template
//   - Kill-switch, scale an toàn, cold vs RT

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  getAdAccountForUser,
  getAccountMetricsDaily,
  listCampaignsWithSummary,
} from '@/lib/queries/ad-accounts';
import { microsToDisplay } from '@/lib/fb/ads-api-client';
import { getOpenRouter } from '@/lib/llm/openrouter';
import { parseRangeFromSearchParams } from '@/lib/ads/date-ranges';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Ctx { params: Promise<{ id: string }> }

const MODEL = 'anthropic/claude-sonnet-4.6';

interface UnitEcon {
  aov: number | null;
  closeRate: number | null;
  grossMargin: number | null;
  profitMargin: number | null;
}

function formatMicro(micros: number, currency: string): string {
  return microsToDisplay(micros, currency);
}

function buildCplSection(econ: UnitEcon, currency: string): { section: string; cplBreakeven: number | null; cplTarget: number | null } {
  if (econ.aov && econ.closeRate && econ.grossMargin) {
    const pm = econ.profitMargin ?? 0.3;
    const leadValue = econ.aov * econ.closeRate * econ.grossMargin;
    const cplBreakeven = leadValue;
    const cplTarget = leadValue * (1 - pm);
    const cplBreakevenMicros = cplBreakeven * 1_000_000;
    const cplTargetMicros = cplTarget * 1_000_000;
    const section = `## Kinh tế đơn vị
- AOV: ${econ.aov.toLocaleString('vi-VN')}đ
- Tỷ lệ chốt: ${(econ.closeRate * 100).toFixed(0)}%
- Biên gộp: ${(econ.grossMargin * 100).toFixed(0)}%
- Biên lời giữ lại: ${(pm * 100).toFixed(0)}%
- **Giá trị mỗi lead = ${cplBreakeven.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}đ**
- **CPL hòa vốn = ${cplBreakeven.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}đ** (chi đúng mức này thì huề)
- **CPL trần (mục tiêu) = ${cplTarget.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}đ** (đây là mốc 🟢 thật)`;
    return { section, cplBreakeven: cplBreakevenMicros, cplTarget: cplTargetMicros };
  }
  return {
    section: `## Kinh tế đơn vị
_(Chưa nhập — sẽ dùng benchmark ngành để đánh giá)_`,
    cplBreakeven: null,
    cplTarget: null,
  };
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = parseRangeFromSearchParams(sp);

  const account = await getAdAccountForUser(id, user.userId);
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let econ: UnitEcon = { aov: null, closeRate: null, grossMargin: null, profitMargin: 0.3 };
  try {
    const body = await req.json();
    econ = { aov: body.aov ?? null, closeRate: body.closeRate ?? null, grossMargin: body.grossMargin ?? null, profitMargin: body.profitMargin ?? 0.3 };
  } catch { /* body optional */ }

  const [dailyMetrics, campaigns] = await Promise.all([
    getAccountMetricsDaily(id, user.userId, { sinceDate: range.from, untilDate: range.to }),
    listCampaignsWithSummary(id, user.userId, { sinceDate: range.from, untilDate: range.to }),
  ]);

  // KPI tổng
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0;
  const dailyLines: string[] = [];
  for (const d of dailyMetrics) {
    totalSpend += d.spendMicros;
    totalImpressions += d.impressions;
    totalClicks += d.clicks;
    totalConversions += d.conversions;
    const dayCtr = d.impressions > 0 ? (d.clicks / d.impressions * 100).toFixed(2) : '0';
    const dayCpm = d.impressions > 0 ? (d.spendMicros / d.impressions * 1000 / 1_000_000).toFixed(0) : '0';
    dailyLines.push(`  ${d.date}: spend ${formatMicro(d.spendMicros, account.currency)}, CTR ${dayCtr}%, CPM ${dayCpm}đ, kết quả ${d.conversions}`);
  }

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const cpl = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Kinh tế đơn vị
  const { section: econSection, cplBreakeven, cplTarget } = buildCplSection(econ, account.currency);

  // Campaign detail + significance check
  const campaignLines: string[] = [];
  for (const c of campaigns) {
    const s = c.summary30d;
    if (!s) { campaignLines.push(`- [${c.status}] ${c.name} (${c.objective}): chưa có data`); continue; }

    const campCpl = s.conversions > 0 ? s.spendMicros / s.conversions : null;
    const campCtr = s.impressions > 0 ? (s.clicks / s.impressions * 100).toFixed(2) : '0';
    const campCpm = s.impressions > 0 ? (s.spendMicros / s.impressions * 1000 / 1_000_000).toFixed(0) : '0';
    const campBudget = c.dailyBudgetMicros ? `budget/ngày ${formatMicro(c.dailyBudgetMicros, account.currency)}` : c.lifetimeBudgetMicros ? `budget trọn đời ${formatMicro(c.lifetimeBudgetMicros, account.currency)}` : 'budget không rõ';

    // Significance check
    let sig = '⚪ CHƯA ĐỦ DATA';
    if (cplTarget !== null && s.conversions >= 30) sig = 'ĐỦ DATA';
    else if (cplTarget !== null && s.spendMicros >= 3 * cplTarget) sig = 'ĐỦ DATA';
    else if (cplTarget === null && s.conversions >= 30) sig = 'ĐỦ DATA';

    // CPL vs target
    let cplFlag = '';
    if (campCpl !== null && cplTarget !== null && cplBreakeven !== null && sig === 'ĐỦ DATA') {
      if (campCpl < cplTarget) cplFlag = '🟢';
      else if (campCpl <= cplBreakeven) cplFlag = '🟡';
      else cplFlag = '🔴';
    } else if (sig === 'ĐỦ DATA') {
      cplFlag = '(chưa có CPL trần)';
    }

    const cplStr = campCpl !== null ? formatMicro(campCpl, account.currency) : 'N/A (0 kết quả)';
    const nameTag = c.name.match(/retar|warm|rt\b|rtg/i) ? '[RT]' : '[Cold?]';

    campaignLines.push(
      `- ${cplFlag || ''}${sig === '⚪ CHƯA ĐỦ DATA' ? '⚪' : ''} [${c.status}] ${nameTag} ${c.name} | Mục tiêu: ${c.objective} | ${campBudget}` +
      `\n  Spend: ${formatMicro(s.spendMicros, account.currency)} | Kết quả: ${s.conversions} | CPL: ${cplStr} | CTR: ${campCtr}% | CPM: ${campCpm}đ | Significance: ${sig}`
    );
  }

  const prompt = `Bạn là nhà quảng cáo chuyên nghiệp — Meta Ads Profit Engine. Nhiệm vụ: tối đa hóa LỢI NHUẬN, không phải săn CPL rẻ. Phân tích nghiêm túc, dùng số liệu cụ thể, không tô hồng. NULL → N/A.

---

## Tài khoản: ${account.name}
- Kỳ: ${range.from} → ${range.to} (${range.days} ngày)
- Tiền tệ: ${account.currency}

${econSection}

## KPI tổng hợp kỳ này
| Chỉ số | Giá trị |
|--------|---------|
| Tổng chi tiêu | ${formatMicro(totalSpend, account.currency)} |
| Impressions | ${totalImpressions.toLocaleString('vi-VN')} |
| Clicks | ${totalClicks.toLocaleString('vi-VN')} |
| CTR | ${ctr.toFixed(2)}% |
| CPM | ${formatMicro(cpm, account.currency)} |
| CPC | ${formatMicro(cpc, account.currency)} |
| Tổng kết quả | ${totalConversions} |
| CPL (kết quả/chi tiêu) | ${cpl > 0 ? formatMicro(cpl, account.currency) : 'N/A'} |

## Xu hướng theo ngày (phát hiện fatigue: CPM tăng + CTR giảm = fatigue)
${dailyLines.join('\n') || 'Không có data ngày'}

## Chi tiết từng campaign (đã phân loại significance + màu CPL)
Ghi chú: ⚪ = chưa đủ data (CẤM kết luận tốt/xấu), 🟢/🟡/🔴 = đã qua ngưỡng
[RT] = retargeting (tên chứa retar/warm/rt), [Cold?] = cold/unknown
${campaignLines.join('\n') || 'Không có campaign'}

---

## YÊU CẦU PHÂN TÍCH — BÁO CÁO 7 PHẦN

Hãy viết đầy đủ 7 phần sau. Nếu thiếu data (kết quả = 0, ⚪) thì nói rõ thay vì bịa.

### PHẦN 1 — TỔNG QUAN
- Tổng kết: hệ thống đang lời hay lỗ so với CPL trần? % ngân sách chảy vào mã 🔴?
- Nhận định 2-3 câu về tình trạng chung.

### PHẦN 2 — BẢNG TỪNG CAMPAIGN
Sắp xếp theo khoảng cách tới CPL trần (lời nhất → lỗ nhất, ⚪ cuối cùng).
Ghi rõ: campaign | tầng cold/RT | CPL | so CPL trần | kết quả | chi tiêu | CTR | CPM | significance | màu

### PHẦN 3 — ĐIỂM SÁNG & ĐIỂM TỐI
- 3 điểm sáng: mã 🟢 đã qua significance — vì sao ăn, đề xuất scale ≤20%/2-3 ngày
- 3 điểm tối: ưu tiên mã ĐỐT NHIỀU TIỀN vào kết quả lỗ — chẩn đoán, hành động cụ thể

### PHẦN 4 — CHẨN ĐOÁN GỐC RỄ
- Phễu: impressions → clicks → kết quả — rò rỉ ở đâu?
- Fatigue động: CPM/CTR xu hướng theo ngày? (nhìn bảng xu hướng ngày)
- Fragmentation: bao nhiêu campaign chưa qua significance? Có nên gộp?
- Lưu ý: 3 Ranking (Quality/Engagement/Conversion Rate Ranking) chưa có trong DB — nếu muốn chẩn đoán sâu hơn cần sync thêm data ad-level từ Facebook

### PHẦN 5 — MA TRẬN QUYẾT ĐỊNH
| Nhóm | Điều kiện | Campaign | Hành động |
Scale chỉ dành cho 🟢 đã thoát learning (≥50 kết quả/tuần). Scale ≤20%/2-3 ngày hoặc duplicate.

### PHẦN 6 — HÀNH ĐỘNG 7 NGÀY + KILL-SWITCH
Kill-switch tuyệt đối:
- Mã chi ≥ 1× CPL hòa vốn mà 0 kết quả → tắt ngay hôm nay
- Mã CPL ≥ 2× CPL hòa vốn sau significance → tắt ngay
Lịch ngày 1-2 (cắt máu), ngày 3-5 (tối ưu), ngày 6-7 (thử nghiệm).

### PHẦN 7 — ƯU TIÊN SỐ 1
Nếu chỉ làm 1 việc hôm nay, đó là gì? Nêu rõ tên campaign và hành động cụ thể.

---
Viết bằng tiếng Việt. Dùng số liệu cụ thể. Không tô hồng. Không bịa.`;

  let client;
  try {
    client = await getOpenRouter();
  } catch {
    return NextResponse.json(
      { error: 'OpenRouter chưa cấu hình. Admin vào /settings/integrations để set API key.' },
      { status: 503 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const completion = await client.chat.completions.create({
          model: MODEL,
          max_tokens: 3000,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        });
        for await (const chunk of completion) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'LLM error';
        controller.enqueue(encoder.encode(`\n\n⚠️ Lỗi: ${msg}`));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'X-Accel-Buffering': 'no',
    },
  });
}
