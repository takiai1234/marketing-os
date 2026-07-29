// POST /api/rewrite/generate-image
//
// Tạo ảnh minh hoạ cho bài viết đã viết lại — dùng kie.ai (không cần skillId).
//
// Body: { model, prompt, input?: { aspect_ratio?, resolution? } }
// Response: { assetId, assetType }
// Frontend poll GET /api/generate/[assetId]/status để biết khi xong.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  isKieConfigured,
  isValidKieModelId,
  getModel,
  createTask,
} from '@/lib/llm/kie-ai';
import { createAsset, setAssetTaskId, updateAssetStatus } from '@/lib/queries/generated-asset';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  model: z.string().refine(isValidKieModelId, 'Unknown image model'),
  prompt: z.string().trim().min(3, 'Prompt quá ngắn').max(10_000, 'Prompt quá dài'),
  input: z.object({
    aspect_ratio: z.string().optional(),
    resolution: z.string().optional(),
  }).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await isKieConfigured())) {
    return NextResponse.json(
      { error: 'KIE_AI_API_KEY chưa cấu hình. Admin vào /settings/integrations để set.' },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const model = getModel(parsed.data.model);
  if (!model || model.type !== 'image') {
    return NextResponse.json({ error: 'Chỉ hỗ trợ image model' }, { status: 400 });
  }

  const asset = await createAsset({
    skillId: null,
    userId: user.userId,
    assetType: 'image',
    model: model.id,
    prompt: parsed.data.prompt,
    inputParams: parsed.data.input ?? {},
  });

  const kieInput: Record<string, unknown> = {
    prompt: parsed.data.prompt,
    ...(parsed.data.input ?? {}),
  };

  try {
    const { taskId, raw } = await createTask({ model: model.id, input: kieInput });
    await setAssetTaskId(asset.id, taskId, raw);
    return NextResponse.json({ assetId: asset.id, assetType: 'image' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'kie.ai error';
    await updateAssetStatus(asset.id, { status: 'failed', errorMessage: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
