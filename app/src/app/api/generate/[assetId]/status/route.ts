// GET /api/generate/[assetId]/status
//
// Frontend poll endpoint. Logic:
//   1. Fetch generated_asset by id + user_id (privacy filter).
//   2. Nếu status local đã là 'success' | 'failed' → return ngay (no upstream call).
//   3. Nếu pending/running và có taskId → gọi kie.ai getTaskInfo, parse, update DB.
//   4. Trả về { status, resultUrl, errorMessage, costCredits, model, assetType }.
//
// Idempotent: gọi nhiều lần không đổi data nếu task chưa xong.

import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getTaskInfo } from '@/lib/llm/kie-ai';
import {
  getAssetForUser,
  updateAssetStatus,
} from '@/lib/queries/generated-asset';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { assetId } = await params;
  if (!UUID_RE.test(assetId)) {
    return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
  }

  let asset = await getAssetForUser(assetId, user.userId);
  if (!asset) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Terminal — không cần gọi kie nữa
  if (asset.status === 'success' || asset.status === 'failed') {
    return NextResponse.json(serialize(asset));
  }

  // Chưa có taskId nghĩa là createTask thất bại trước khi save → already failed,
  // nhưng nếu vẫn pending thì poll cũng vô nghĩa.
  if (!asset.taskId) {
    return NextResponse.json(serialize(asset));
  }

  // Gọi kie.ai để check
  try {
    const info = await getTaskInfo(asset.taskId);

    // Chỉ update khi status đổi (tránh write rác)
    if (info.status !== asset.status || info.resultUrls[0]) {
      await updateAssetStatus(assetId, {
        status: info.status,
        resultUrl: info.resultUrls[0] ?? null,
        errorMessage: info.errorMessage,
        costCredits: info.costCredits,
        rawResponse: info.raw,
      });
      // Refresh DB row để response phản ánh state mới
      const refreshed = await getAssetForUser(assetId, user.userId);
      if (refreshed) asset = refreshed;
    }
  } catch (err) {
    // Không update status — giữ pending/running để client thử lại
    const msg = err instanceof Error ? err.message : 'kie.ai status query failed';
    return NextResponse.json(
      { ...serialize(asset), warning: msg },
      { status: 200 }
    );
  }

  return NextResponse.json(serialize(asset));
}

function serialize(asset: {
  id: string;
  status: string;
  resultUrl: string | null;
  errorMessage: string | null;
  costCredits: number | null;
  model: string;
  assetType: string;
  prompt: string;
  createdAt: string;
  completedAt: string | null;
}) {
  return {
    id: asset.id,
    status: asset.status,
    resultUrl: asset.resultUrl,
    errorMessage: asset.errorMessage,
    costCredits: asset.costCredits,
    model: asset.model,
    assetType: asset.assetType,
    prompt: asset.prompt,
    createdAt: asset.createdAt,
    completedAt: asset.completedAt,
  };
}
