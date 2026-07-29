// POST /api/skills/[id]/generate
//
// Tạo ảnh qua 9Router (GPT Image 2) — đồng bộ, không cần polling.
// Kết quả lưu vào generated_asset để hiển thị history.
//
// Body: { prompt, size? }
// size: "1024x1024" | "1792x1024" | "1024x1792"

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getOpenRouter, isOpenRouterConfigured } from '@/lib/llm/openrouter';
import { createAsset, updateAssetStatus } from '@/lib/queries/generated-asset';

export const runtime = 'nodejs';
export const maxDuration = 120;

const VALID_SIZES = ['1024x1024', '1792x1024', '1024x1792'] as const;
type ImageSize = (typeof VALID_SIZES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  prompt: z.string().trim().min(3).max(4_000),
  size: z.enum(VALID_SIZES).default('1024x1024'),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  if (!(await isOpenRouterConfigured())) {
    return NextResponse.json(
      { error: 'NINE_ROUTER_API_KEY chưa cấu hình. Admin vào /settings/integrations để set.' },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: skillId } = await params;
  if (!UUID_RE.test(skillId)) {
    return NextResponse.json({ error: 'Invalid skill id' }, { status: 400 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
  }

  const asset = await createAsset({
    skillId,
    userId: user.userId,
    assetType: 'image',
    model: 'gpt-image-2',
    prompt: parsed.data.prompt,
    inputParams: { size: parsed.data.size },
  });

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
    const resultUrl = url ?? (b64 ? `data:image/png;base64,${b64}` : null);

    if (!resultUrl) {
      await updateAssetStatus(asset.id, { status: 'failed', errorMessage: 'Không nhận được ảnh từ 9Router' });
      return NextResponse.json({ error: 'Không nhận được ảnh từ 9Router' }, { status: 502 });
    }

    await updateAssetStatus(asset.id, { status: 'success', resultUrl });
    return NextResponse.json({ assetId: asset.id, url: resultUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '9Router image generation error';
    await updateAssetStatus(asset.id, { status: 'failed', errorMessage: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
