// POST /api/channels/[id]/token — admin-only, replace Page Access Token
// trên existing channel mà KHÔNG mất config (owner, KPI, persona, history).
//
// Use cases:
//   - Token cũ hết hạn (FB throw #190 trong cron)
//   - Token cũ thiếu scope mới (vd vừa add `read_insights` vào Meta App)
//   - Đổi sang App khác → re-onboard nhẹ nhàng
//
// Flow:
//   1. Validate request: admin role + UUID + bodySchema
//   2. Verify token với FB:
//      a) GET /debug_token → check is_valid + type=PAGE + scopes có
//         pages_read_engagement (min required cho insights)
//      b) GET /me?fields=id,name,category → verify page_id khớp với
//         external_id của channel (chống admin paste nhầm token của
//         page khác → ghi đè data sai)
//   3. Encrypt + UPDATE social_account.access_token_encrypted
//   4. Return token info (scopes, expires_at, token type) cho UI hiển thị

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { encryptToken, decryptToken } from '@/lib/fb/token-encryption';

export const runtime = 'nodejs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FB_VERSION = 'v25.0';
const FB_BASE = `https://graph.facebook.com/${FB_VERSION}`;

// Min required scope cho sync hoạt động. Không có cái này → block save
// để admin biết phải regenerate token với scope phù hợp.
const REQUIRED_SCOPES = ['pages_read_engagement'] as const;

const bodySchema = z.object({
  pageToken: z.string().trim().min(20, 'Page Token quá ngắn — kiểm tra lại'),
});

interface FbDebugResponse {
  data?: {
    is_valid?: boolean;
    type?: string;
    expires_at?: number;
    scopes?: string[];
    error?: { message?: string; code?: number };
    profile_id?: string;
  };
  error?: { message?: string; code?: number };
}

interface FbMeResponse {
  id?: string;
  name?: string;
  category?: string;
  error?: { message?: string; code?: number };
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin-only — đổi token = quyền access toàn bộ kênh, không cho member thường
  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 });
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
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { pageToken } = parsed.data;

  // Lookup channel — cần external_id để verify token khớp đúng page
  const channelRes = await db.query<{ external_id: string; name: string }>(
    `SELECT external_id, name FROM social_account WHERE id = $1`,
    [id]
  );
  const channel = channelRes.rows[0];
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const t = encodeURIComponent(pageToken);

  // Step 2a: /debug_token — validate token + extract metadata
  let debugData: NonNullable<FbDebugResponse['data']>;
  try {
    const debugRes = await fetch(
      `${FB_BASE}/debug_token?input_token=${t}&access_token=${t}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    const debugJson = (await debugRes.json()) as FbDebugResponse;
    if (debugJson.error) {
      return NextResponse.json(
        { error: `FB debug_token error: ${debugJson.error.message ?? 'unknown'}` },
        { status: 400 }
      );
    }
    debugData = debugJson.data ?? {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return NextResponse.json(
      { error: `FB API call failed: ${msg}` },
      { status: 502 }
    );
  }

  if (!debugData.is_valid) {
    return NextResponse.json(
      { error: 'Token không valid theo FB debug_token' },
      { status: 400 }
    );
  }
  if (debugData.type !== 'PAGE') {
    return NextResponse.json(
      {
        error: `Cần Page Access Token. Token bạn paste là loại "${debugData.type ?? 'unknown'}". Trong Graph Explorer, switch dropdown sang Page Token của ${channel.name}.`,
      },
      { status: 400 }
    );
  }

  const scopes = debugData.scopes ?? [];
  const missingScopes = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  if (missingScopes.length > 0) {
    return NextResponse.json(
      {
        error: `Token thiếu scope: ${missingScopes.join(', ')}. Generate Access Token lại với scope này tick.`,
      },
      { status: 400 }
    );
  }

  // Step 2b: /me — verify page_id khớp external_id của channel
  let meData: FbMeResponse;
  try {
    const meRes = await fetch(
      `${FB_BASE}/me?fields=id,name,category&access_token=${t}`,
      { signal: AbortSignal.timeout(15_000) }
    );
    meData = (await meRes.json()) as FbMeResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return NextResponse.json(
      { error: `FB /me call failed: ${msg}` },
      { status: 502 }
    );
  }

  if (meData.error) {
    return NextResponse.json(
      { error: `FB /me error: ${meData.error.message ?? 'unknown'}` },
      { status: 400 }
    );
  }
  if (!meData.id || meData.id !== channel.external_id) {
    return NextResponse.json(
      {
        error: `Token này của page "${meData.name ?? meData.id}" (id: ${meData.id}), KHÔNG phải của kênh "${channel.name}" (id: ${channel.external_id}). Refuse để chống ghi đè data.`,
      },
      { status: 400 }
    );
  }

  // Step 3: encrypt + save
  const encrypted = await encryptToken(pageToken);

  try {
    const updateRes = await db.query(
      `UPDATE social_account
          SET access_token_encrypted = $2,
              status = 'active'           -- reset từ token_expired nếu trước đó fail
        WHERE id = $1
        RETURNING id`,
      [id, encrypted]
    );
    if (updateRes.rowCount === 0) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    page: {
      id: meData.id,
      name: meData.name,
      category: meData.category,
    },
    token: {
      type: debugData.type,
      // expires_at = 0 → token vĩnh viễn (long-lived page token kế thừa từ
      // long-lived user token); số khác = epoch seconds
      expires_at: debugData.expires_at ?? 0,
      scopes,
    },
  });
}

// GET /api/channels/[id]/token — admin-only, trả về plaintext token để copy
export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = await getUserRole(user.userId);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const res = await db.query<{ access_token_encrypted: Buffer | null; platform: string }>(
    `SELECT access_token_encrypted, platform FROM social_account WHERE id = $1`,
    [id]
  );
  const row = res.rows[0];
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!row.access_token_encrypted) return NextResponse.json({ token: null });
  if (row.platform !== 'facebook') return NextResponse.json({ error: 'Chỉ hỗ trợ Facebook token' }, { status: 400 });

  const plain = await decryptToken(row.access_token_encrypted);
  return NextResponse.json({ token: plain });
}
