// POST /api/ads/analyze
// Phân tích tổng hợp tất cả ad accounts active — overview level.

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

const MODEL = 'anthropic/claude-sonnet-4.6';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = parseRangeFromSearchParams(sp);

  const [accounts, summaries] = await Promise.all([
    listAdAccountsForUser(user.userId),
    getAccountSummaries(user.userId, { sinceDate: range.from, untilDate: range.to }),
  ]);

  const activeAccounts = accounts.filter((a) => a.status === 'active');
  if (activeAccounts.length === 0) {
    return NextResponse.json({ error: 'Không có ad account active nào để phân tích.' }, { status: 400 });
  }

  // Tổng hợp KPIs cross-account (VND chủ yếu)
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0;
  const accountLines: string[] = [];
  let currency = activeAccounts[0]?.currency ?? 'VND';

  for (const acc of activeAccounts) {
    const s = summaries[acc.id];
    if (!s) continue;
    totalSpend += s.totalSpendMicros;
    totalImpressions += s.totalImpressions;
    totalClicks += s.totalClicks;
    totalConversions += s.totalConversions;
    if (acc.currency !== currency) currency = 'VND'; // fallback mixed
    const accCtr = s.totalImpressions > 0 ? (s.totalClicks / s.totalImpressions * 100).toFixed(2) : '0';
    accountLines.push(
      `- ${acc.name}: spend ${microsToDisplay(s.totalSpendMicros, acc.currency)}, CTR ${accCtr}%, kết quả ${s.totalConversions}`
    );
  }

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  const prompt = `Bạn là một nhà quảng cáo chuyên nghiệp với 10 năm kinh nghiệm chạy Facebook Ads tại thị trường Việt Nam. Hãy phân tích tổng quan hiệu quả của toàn bộ tài khoản quảng cáo.

## Tổng quan — ${activeAccounts.length} tài khoản active
- Kỳ phân tích: ${range.from} → ${range.to} (${range.days} ngày)
- Tổng chi tiêu: ${microsToDisplay(totalSpend, currency)}
- Tổng Impressions: ${totalImpressions.toLocaleString('vi-VN')}
- Tổng Clicks: ${totalClicks.toLocaleString('vi-VN')}
- CTR trung bình: ${ctr.toFixed(2)}%
- CPC trung bình: ${microsToDisplay(cpc, currency)}
- CPM trung bình: ${microsToDisplay(cpm, currency)}
- Tổng kết quả: ${totalConversions}
- CPA trung bình: ${cpa > 0 ? microsToDisplay(cpa, currency) : 'Chưa có dữ liệu'}

## Từng tài khoản
${accountLines.join('\n') || 'Không có data'}

## Benchmark thị trường Việt Nam (Facebook Ads 2024-2025)
- CTR trung bình: 0.8% - 1.5% (tốt: >2%)
- CPM trung bình: 15.000đ - 40.000đ (tốt nếu < 20.000đ)
- CPC trung bình: 2.000đ - 8.000đ (tốt nếu < 3.000đ)

## Yêu cầu phân tích
1. **Tổng quan hiệu quả** — đánh giá tình trạng chung danh mục quảng cáo
2. **Tài khoản nổi bật** — account nào đang hoạt động tốt nhất / kém nhất và tại sao
3. **Điểm cần cải thiện** — chỉ số nào dưới benchmark, nguyên nhân
4. **Khuyến nghị phân bổ ngân sách** — nên tăng/giảm budget account nào
5. **Hành động ưu tiên** — 3 việc cần làm ngay

Trả lời bằng tiếng Việt, súc tích, dùng số liệu cụ thể.`;

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
          max_tokens: 2048,
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
