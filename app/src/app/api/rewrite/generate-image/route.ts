// POST /api/rewrite/generate-image
//
// Tạo ảnh minh hoạ qua 9Router (gpt-image-2 / dall-e-3).
// Đồng bộ — trả về URL ảnh ngay, không cần polling.
//
// Body: { prompt, size? }
// size: "1024x1024" | "1792x1024" | "1024x1792" (default 1024x1024)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getOpenRouter, isOpenRouterConfigured } from '@/lib/llm/openrouter';

export const runtime = 'nodejs';
export const maxDuration = 120;

const VALID_SIZES = ['1024x1024', '1792x1024', '1024x1792'] as const;
type ImageSize = (typeof VALID_SIZES)[number];

const bodySchema = z.object({
  prompt: z.string().trim().min(3, 'Prompt quá ngắn').max(4_000, 'Prompt quá dài'),
  size: z.enum(VALID_SIZES).default('1024x1024'),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isOpenRouterConfigured())) {
    return NextResponse.json(
      { error: 'NINE_ROUTER_API_KEY chưa cấu hình. Admin vào /settings/integrations để set.' },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  try {
    const client = await getOpenRouter();
    const response = await client.images.generate({
      model: 'gpt-image-2',
      prompt: parsed.data.prompt,
      n: 1,
      size: parsed.data.size as ImageSize,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const imageData = response.data?.[0];
    const url = imageData?.url ?? null;
    const b64 = (imageData as Record<string, unknown>)?.b64_json as string | undefined;

    if (!url && !b64) {
      return NextResponse.json({ error: 'Không nhận được ảnh từ 9Router' }, { status: 502 });
    }

    return NextResponse.json({
      url: url ?? `data:image/png;base64,${b64}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '9Router image generation error';
    console.error('[POST /rewrite/generate-image]', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
