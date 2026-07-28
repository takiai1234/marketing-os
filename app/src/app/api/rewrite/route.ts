// POST /api/rewrite
//
// Generate "Viết lại bài viết tương tự" cho 1 bài Library post hoặc 1
// News article. Source content được gửi từ client trực tiếp (KHÔNG load
// từ DB) — vì:
//   1. Library post + News card đã hiển thị content cho user, gửi lại
//      không tăng risk privacy
//   2. Tránh thêm 1 DB lookup → giảm latency
//   3. Cho phép user edit source trước khi rewrite (nice future feature)
//
// Body JSON:
//   {
//     "sourceType": "library_post" | "news",
//     "sourceContent": "string",     // bài gốc đầy đủ
//     "sourceContext": "string|null",// vd "FB Trang ABC" hoặc "TechCrunch"
//     "sourcePlatform": "string|null",// 'facebook'/'tiktok'/... (Library only)
//     "model": "anthropic/claude-sonnet-latest" | ...,
//     "tone": "friendly" | ...,
//     "platform": "facebook_post" | ...,
//     "length": "short" | "medium" | "long",
//     "customInstructions": "string"
//   }
//
// Trả:
//   { content: string, tokensIn, tokensOut, model, finishReason }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  chatComplete,
  isOpenRouterConfigured,
  isValidModelId,
  AVAILABLE_MODELS,
} from '@/lib/llm/openrouter';
import {
  buildRewritePrompt,
  type RewriteSourceType,
  type RewriteTone,
  type RewritePlatform,
  type RewriteLength,
  type SkillContext,
} from '@/lib/rewrite/build-prompt';
import { getSkillById, getSkillStoragePath } from '@/lib/queries/skill-lib';
import { loadSkillContent } from '@/lib/skill-lib/load-skill-content';

export const runtime = 'nodejs';
export const maxDuration = 120;

const bodySchema = z.object({
  sourceType: z.enum(['library_post', 'news']),
  sourceContent: z.string().trim().min(5, 'Source content quá ngắn').max(50_000, 'Source content quá dài'),
  sourceContext: z.string().max(500).nullable().optional(),
  sourcePlatform: z.string().max(50).nullable().optional(),
  model: z
    .string()
    .refine(isValidModelId, {
      message: `model must be one of: ${AVAILABLE_MODELS.map((m) => m.id).join(', ')}`,
    }),
  tone: z.enum(['professional', 'friendly', 'gen-z', 'storytelling', 'analytical']),
  platform: z.enum([
    'facebook_post',
    'facebook_reel',
    'tiktok',
    'threads',
    'blog',
    'instagram',
  ]),
  length: z.enum(['short', 'medium', 'long']),
  customInstructions: z.string().max(5_000).default(''),
  skillId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    return await handlePost(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error('[POST /rewrite] UNHANDLED:', msg, '\n', stack);
    return NextResponse.json({ error: `Lỗi server: ${msg}` }, { status: 500 });
  }
}

async function handlePost(req: NextRequest): Promise<NextResponse> {
  if (!(await isOpenRouterConfigured())) {
    return NextResponse.json(
      { error: 'NINE_ROUTER_API_KEY chưa cấu hình. Admin vào /settings/integrations để set.' },
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

  // Load skill content nếu user chọn skill
  let skillContext: SkillContext | null = null;
  if (parsed.data.skillId) {
    const [storage, skill] = await Promise.all([
      getSkillStoragePath(parsed.data.skillId),
      getSkillById(parsed.data.skillId),
    ]);
    if (storage && skill) {
      try {
        const content = loadSkillContent(storage.storage_path);
        if (content.main) {
          skillContext = {
            skillName: skill.name,
            mainContent: content.main,
            supporting: content.supporting || undefined,
          };
        }
      } catch (err) {
        console.warn('[POST /rewrite] skill content load failed:', err);
        // Không fail request — chỉ bỏ qua skill
      }
    }
  }

  const { system, user: userMsg } = buildRewritePrompt({
    sourceType: parsed.data.sourceType as RewriteSourceType,
    sourceContent: parsed.data.sourceContent,
    sourceContext: parsed.data.sourceContext ?? null,
    sourcePlatform: parsed.data.sourcePlatform ?? null,
    tone: parsed.data.tone as RewriteTone,
    platform: parsed.data.platform as RewritePlatform,
    length: parsed.data.length as RewriteLength,
    customInstructions: parsed.data.customInstructions,
    skillContext,
  });

  try {
    // Length cap output tokens phù hợp — short ~300, medium ~800, long ~2000
    const maxOutputTokens =
      parsed.data.length === 'short'
        ? 600
        : parsed.data.length === 'long'
          ? 4000
          : 2000;

    const result = await chatComplete({
      model: parsed.data.model,
      maxTokens: maxOutputTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
    });

    if (!result.content.trim()) {
      return NextResponse.json(
        {
          error:
            'Model không trả về nội dung — thử đổi model khác hoặc thêm yêu cầu cụ thể hơn.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      content: result.content,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      model: result.model,
      finishReason: result.finishReason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenRouter API error';
    console.error('[POST /rewrite] OpenRouter ERROR:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
