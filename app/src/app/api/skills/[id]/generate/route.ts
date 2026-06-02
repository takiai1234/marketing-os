// POST /api/skills/[id]/generate
//
// Submit generation task to kie.ai → save asset row → return assetId + taskId.
// Frontend poll GET /api/generate/[assetId]/status để biết khi xong.
//
// Body:
//   {
//     "model": "gpt-image-2-text-to-image" | "grok-imagine/text-to-video" | ...,
//     "prompt": "...",
//     "input": { ...model-specific params (aspect_ratio, resolution, duration, ...) }
//   }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import { isKieConfigured, isValidKieModelId, getModel, createTask } from '@/lib/llm/kie-ai';
import { createAsset, setAssetTaskId, updateAssetStatus } from '@/lib/queries/generated-asset';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  model: z.string().refine(isValidKieModelId, 'Unknown model — check kie-ai.ts'),
  prompt: z.string().trim().min(3, 'Prompt quá ngắn').max(20_000, 'Prompt quá dài'),
  input: z.record(z.string(), z.unknown()).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  if (!(await isKieConfigured())) {
    return NextResponse.json(
      {
        error:
          'KIE_AI_API_KEY chưa cấu hình. Admin vào /settings/integrations để set.',
      },
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
  if (!model) {
    return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
  }

  // 1. Tạo row DB ở trạng thái pending (lưu input trước khi gọi kie)
  const asset = await createAsset({
    skillId,
    userId: user.userId,
    assetType: model.type,
    model: model.id,
    prompt: parsed.data.prompt,
    inputParams: parsed.data.input ?? {},
  });

  // 2. Build kie.ai input — merge prompt + user params
  const kieInput: Record<string, unknown> = {
    prompt: parsed.data.prompt,
    ...(parsed.data.input ?? {}),
  };

  // 3. Submit to kie.ai
  try {
    const { taskId, raw } = await createTask({
      model: model.id,
      input: kieInput,
      // callBackUrl: optional — không dùng trong MVP, dùng polling thay
    });

    await setAssetTaskId(asset.id, taskId, raw);

    return NextResponse.json({
      assetId: asset.id,
      taskId,
      assetType: model.type,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'kie.ai error';
    await updateAssetStatus(asset.id, {
      status: 'failed',
      errorMessage: msg,
    });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
