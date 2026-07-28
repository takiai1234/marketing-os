// POST /api/ads/analyze
// Phân tích tổng hợp tất cả ad accounts — Meta Ads Profit Engine framework.

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  listAdAccountsForUser,
  getAccountSummaries,
} from '@/lib/queries/ad-accounts';
import { microsToDisplay } from '@/lib/fb/ads-api-client';
import { getOpenRouter } from '@/lib/llm/openrouter';
import { parseRangeFromSearchParams } from '@/lib/ads/date-ranges';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'cc/claude-sonnet-4-5-20250929';

interface ProductCpl {
  name: string;
  cplTarget: number;
  cplBreakeven: number | null;
}

function fmt(n: number): string {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'đ';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = parseRangeFromSearchParams(sp);

  let products: ProductCpl[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body.products)) products = body.products;
  } catch { /* body optional */ }

  const [accounts, summaries] = await Promise.all([
    listAdAccountsForUser(user.userId),
    getAccountSummaries(user.userId, { sinceDate: range.from, untilDate: range.to }),
  ]);

  const activeAccounts = accounts.filter((a) => a.status === 'active');
  if (activeAccounts.length === 0) {
    return NextResponse.json({ error: 'Không có ad account active nào để phân tích.' }, { status: 400 });
  }

  const productSection = products.length > 0
    ? `## CPL trần theo sản phẩm\n` + products.map((p) =>
        `- **${p.name}**: CPL trần = ${fmt(p.cplTarget)}` +
        (p.cplBreakeven ? ` | CPL hòa vốn = ${fmt(p.cplBreakeven)}` : '')
      ).join('\n')
    : `## CPL trần theo sản phẩm\n_(Chưa nhập — AI dùng benchmark ngành)_`;

  // Dùng CPL trần của sản phẩm đầu tiên làm baseline cross-account
  const defaultCplTarget = products[0]?.cplTarget ?? null;
  const defaultCplBreakeven = products[0]?.cplBreakeven ?? (defaultCplTarget ? defaultCplTarget / 0.7 : null);

  // Tổng KPI + từng account
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0;
  const currency = activeAccounts[0]?.currency ?? 'VND';
  const accountLines: string[] = [];

  for (const acc of activeAccounts) {
    const s = summaries[acc.id];
    if (!s) { accountLines.push(`- ${acc.name}: không có data`); continue; }

    totalSpend += s.totalSpendMicros;
    totalImpressions += s.totalImpressions;
    totalClicks += s.totalClicks;
    totalConversions += s.totalConversions;

    const accCtr = s.totalImpressions > 0 ? (s.totalClicks / s.totalImpressions * 100).toFixed(2) : '0';
    const accCpm = s.totalImpressions > 0 ? (s.totalSpendMicros / s.totalImpressions * 1000 / 1_000_000).toFixed(0) : '0';
    const accCpl = s.totalConversions > 0 ? s.totalSpendMicros / s.totalConversions : null;

    // Significance
    const cplTgtMicros = defaultCplTarget ? defaultCplTarget * 1_000_000 : null;
    const cplBevMicros = defaultCplBreakeven ? defaultCplBreakeven * 1_000_000 : null;
    const hasSig = s.totalConversions >= 30 || (cplTgtMicros !== null && s.totalSpendMicros >= 3 * cplTgtMicros);
    const sig = hasSig ? '✓' : '⚪';

    // CPL flag
    let flag = '';
    if (accCpl !== null && cplTgtMicros !== null && cplBevMicros !== null && hasSig) {
      if (accCpl < cplTgtMicros) flag = '🟢';
      else if (accCpl <= cplBevMicros) flag = '🟡';
      else flag = '🔴';
    }

    accountLines.push(
      `- ${flag}${sig} ${acc.name} (${acc.platform}) | Spend: ${microsToDisplay(s.totalSpendMicros, acc.currency)} | Kết quả: ${s.totalConversions} | CPL: ${accCpl !== null ? microsToDisplay(accCpl, acc.currency) : 'N/A'} | CTR: ${accCtr}% | CPM: ${accCpm}đ`
    );
  }

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const cpl = totalConversions > 0 ? totalSpend / totalConversions : 0;

  const prompt = `Bạn là nhà quảng cáo chuyên nghiệp — Meta Ads Profit Engine. Nhiệm vụ: tối đa hóa LỢI NHUẬN trên toàn danh mục tài khoản quảng cáo. Không tô hồng. Dùng số cụ thể. NULL → N/A.

---

## Tổng quan danh mục — ${activeAccounts.length} tài khoản active
- Kỳ: ${range.from} → ${range.to} (${range.days} ngày)

${productSection}

## KPI tổng hợp toàn danh mục
| Chỉ số | Giá trị |
|--------|---------|
| Tổng chi tiêu | ${microsToDisplay(totalSpend, currency)} |
| Impressions | ${totalImpressions.toLocaleString('vi-VN')} |
| CTR TB | ${ctr.toFixed(2)}% |
| CPM TB | ${microsToDisplay(cpm, currency)} |
| CPC TB | ${microsToDisplay(cpc, currency)} |
| Tổng kết quả | ${totalConversions} |
| CPL TB | ${cpl > 0 ? microsToDisplay(cpl, currency) : 'N/A'} |

## Từng tài khoản (⚪ = chưa đủ data, ✓ = đủ significance, 🟢🟡🔴 = so CPL trần)
${accountLines.join('\n') || 'Không có data'}

---

## YÊU CẦU PHÂN TÍCH — BÁO CÁO 7 PHẦN

### PHẦN 1 — TỔNG QUAN DANH MỤC
- Toàn danh mục đang lời hay lỗ so với CPL trần?
- % ngân sách đang chảy vào tài khoản 🔴?
- Nhận định 2-3 câu về rủi ro lớn nhất.

### PHẦN 2 — BẢNG TỪNG TÀI KHOẢN
Sắp xếp: lời nhất → lỗ nhất (⚪ cuối). Ghi rõ CPL vs CPL trần.

### PHẦN 3 — ĐIỂM SÁNG & ĐIỂM TỐI
- Tài khoản hoạt động tốt nhất: vì sao, đề xuất scale ≤20%/2-3 ngày
- Tài khoản ĐỐT NHIỀU TIỀN NHẤT vào kết quả lỗ: chẩn đoán + hành động

### PHẦN 4 — CHẨN ĐOÁN
- Phễu conversion: rò rỉ ở đâu? (impressions → clicks → kết quả)
- Tài khoản nào có dấu hiệu fatigue hoặc audience saturation?
- Phân bổ ngân sách hiện tại hợp lý chưa?

### PHẦN 5 — MA TRẬN QUYẾT ĐỊNH
Scale / Giữ / Theo dõi / Tắt — với điều kiện significance và learning phase.

### PHẦN 6 — PHÂN BỔ NGÂN SÁCH + KILL-SWITCH
- Kill-switch: tài khoản nào cần cắt ngay hôm nay?
- Phân bổ lại ngân sách giữa các tài khoản (tỷ lệ %).
- Lưu ý: tránh RT > 40% tổng spend (cạn tệp warm).

### PHẦN 7 — ƯU TIÊN SỐ 1
Nếu chỉ làm 1 việc hôm nay là gì? Tên tài khoản + hành động cụ thể + deadline.

---
Viết tiếng Việt. Số cụ thể. Không bịa.`;

  let client;
  try {
    client = await getOpenRouter();
  } catch {
    return NextResponse.json(
      { error: '9Router chưa cấu hình. Admin vào /settings/integrations để set API key.' },
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
