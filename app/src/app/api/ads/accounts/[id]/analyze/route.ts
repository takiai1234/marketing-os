// POST /api/ads/accounts/[id]/analyze
// Gọi Claude qua OpenRouter, phân tích hiệu quả ad account theo vai trò
// nhà quảng cáo chuyên nghiệp. Streams response text.

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

export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const range = parseRangeFromSearchParams(sp);

  const account = await getAdAccountForUser(id, user.userId);
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [dailyMetrics, campaigns] = await Promise.all([
    getAccountMetricsDaily(id, user.userId, { sinceDate: range.from, untilDate: range.to }),
    listCampaignsWithSummary(id, user.userId, { sinceDate: range.from, untilDate: range.to }),
  ]);

  // Tính tổng KPIs
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0;
  for (const d of dailyMetrics) {
    totalSpend += d.spendMicros;
    totalImpressions += d.impressions;
    totalClicks += d.clicks;
    totalConversions += d.conversions;
  }
  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Format campaign summary (top 10 theo spend)
  const topCampaigns = campaigns
    .filter((c) => c.summary30d)
    .slice(0, 10)
    .map((c) => {
      const s = c.summary30d!;
      const campCtr = s.impressions > 0 ? (s.clicks / s.impressions * 100).toFixed(2) : '0';
      return `- ${c.name} (${c.objective}): spend ${microsToDisplay(s.spendMicros, account.currency)}, CTR ${campCtr}%, kết quả ${s.conversions}`;
    })
    .join('\n');

  const prompt = `Bạn là một nhà quảng cáo chuyên nghiệp với 10 năm kinh nghiệm chạy Facebook Ads tại thị trường Việt Nam. Hãy phân tích hiệu quả của tài khoản quảng cáo sau và đưa ra nhận xét cụ thể, thực tiễn.

## Dữ liệu tài khoản: ${account.name}
- Nền tảng: ${account.platform}
- Tiền tệ: ${account.currency}
- Kỳ phân tích: ${range.from} → ${range.to} (${range.days} ngày)

## KPI tổng hợp
- Tổng chi tiêu: ${microsToDisplay(totalSpend, account.currency)}
- Impressions: ${totalImpressions.toLocaleString('vi-VN')}
- Clicks: ${totalClicks.toLocaleString('vi-VN')}
- CTR: ${ctr.toFixed(2)}%
- CPC: ${microsToDisplay(cpc, account.currency)}
- CPM: ${microsToDisplay(cpm, account.currency)}
- Kết quả (conversions): ${totalConversions}
- CPA: ${cpa > 0 ? microsToDisplay(cpa, account.currency) : 'Chưa có dữ liệu'}

## Chi tiết campaigns (top theo spend)
${topCampaigns || 'Không có data campaign'}

## Benchmark thị trường Việt Nam (Facebook Ads 2024-2025)
- CTR trung bình: 0.8% - 1.5% (tốt: >2%)
- CPM trung bình: 15.000đ - 40.000đ (tốt nếu < 20.000đ)
- CPC trung bình: 2.000đ - 8.000đ (tốt nếu < 3.000đ)
- Tỷ lệ chuyển đổi: 1% - 3% (tốt: >3%)

## Yêu cầu phân tích
Hãy phân tích theo cấu trúc sau:
1. **Tổng quan hiệu quả** — đánh giá ngắn gọn tình trạng chung (tốt/trung bình/cần cải thiện)
2. **Điểm mạnh** — những chỉ số đang hoạt động tốt, giải thích tại sao
3. **Điểm cần cải thiện** — chỉ số nào dưới benchmark, nguyên nhân có thể
4. **Khuyến nghị cụ thể** — 3-5 hành động thực tế để cải thiện hiệu quả
5. **Ưu tiên hành động** — cái gì nên làm trước nhất

Trả lời bằng tiếng Việt, súc tích nhưng có chiều sâu. Dùng số liệu cụ thể khi so sánh.`;

  let client;
  try {
    client = await getOpenRouter();
  } catch {
    return NextResponse.json(
      { error: 'OpenRouter chưa cấu hình. Admin vào /settings/integrations để set API key.' },
      { status: 503 }
    );
  }

  // Streaming response
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
