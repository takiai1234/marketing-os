// POST /api/skills/[id]/chat/sessions/[sessionId]/messages
//
// Send user message, call OpenRouter (with whatever model session uses),
// save assistant response, return both.
//
// Non-streaming initially — UX hơi chậm cho long response nhưng đơn giản
// hơn streaming SSE. Add streaming sau nếu cần.
//
// Flow:
//   1. Load session (verify ownership)
//   2. Load skill content → build system prompt
//   3. Load message history → format cho OpenAI SDK
//   4. Append new user message vào DB
//   5. Call OpenRouter (model picked at session creation)
//   6. Append assistant message với tokens_in/out
//   7. Return both messages cho UI

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  getSessionForUser,
  appendMessage,
  updateSessionTitle,
} from '@/lib/queries/skill-chat';
import { getSkillById, getSkillStoragePath } from '@/lib/queries/skill-lib';
import {
  loadSkillContent,
  buildSystemPrompt,
} from '@/lib/skill-lib/load-skill-content';
import { getOpenRouter, isOpenRouterConfigured } from '@/lib/llm/openrouter';

export const runtime = 'nodejs';
// Long-running LLM call — cho phép tới 5 phút (Opus / GPT-5 cho hard topics)
export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  content: z.string().trim().min(1, 'Message rỗng').max(50_000, 'Message quá dài (>50K chars)'),
});

interface RouteContext {
  params: Promise<{ id: string; sessionId: string }>;
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse> {
  if (!(await isOpenRouterConfigured())) {
    return NextResponse.json(
      {
        error:
          'OPENROUTER_API_KEY chưa được cấu hình. Admin vào /settings/integrations để set.',
      },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: skillId, sessionId } = await params;
  if (!UUID_RE.test(skillId) || !UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
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
  const userText = parsed.data.content;

  // 1. Load session + history
  const session = await getSessionForUser(sessionId, user.userId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.skillId !== skillId) {
    return NextResponse.json({ error: 'Session does not belong to this skill' }, { status: 400 });
  }

  // 2. Load skill content
  const [skill, storage] = await Promise.all([
    getSkillById(skillId),
    getSkillStoragePath(skillId),
  ]);
  if (!skill || !storage) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }

  let systemPrompt: string;
  try {
    const content = loadSkillContent(storage.storage_path);
    systemPrompt = buildSystemPrompt(skill.name, content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Không đọc được skill content: ${msg}` },
      { status: 500 }
    );
  }

  // 3. Format messages history cho OpenAI SDK
  //    OpenAI/OpenRouter expect alternating user/assistant. System message
  //    đặt RIÊNG trong messages array (khác với Anthropic SDK dùng `system` param).
  const historyMessages = session.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 4. Persist user message TRƯỚC khi call LLM (preserve input if API fails)
  const userMessage = await appendMessage(sessionId, 'user', userText, 0, 0);

  // 5. Call OpenRouter
  const client = await getOpenRouter();
  let assistantText = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const response = await client.chat.completions.create({
      model: session.model,
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userText },
      ],
    });

    const choice = response.choices[0];
    assistantText = choice?.message?.content ?? '';
    tokensIn = response.usage?.prompt_tokens ?? 0;
    tokensOut = response.usage?.completion_tokens ?? 0;

    if (!assistantText) {
      assistantText = '(Model không trả về nội dung — có thể bị filter hoặc skill cần tool execution chưa support.)';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenRouter API error';
    // Lưu error vào DB như assistant message để user thấy + retry
    await appendMessage(
      sessionId,
      'assistant',
      `❌ Lỗi gọi LLM: ${msg}\n\nThử lại bằng nút send hoặc đổi model khác.`,
      0,
      0
    );
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 6. Persist assistant message với tokens
  const assistantMessage = await appendMessage(
    sessionId,
    'assistant',
    assistantText,
    tokensIn,
    tokensOut
  );

  // 7. Auto-set session title từ first user message (truncate 60 chars)
  if (
    session.title === 'Cuộc trò chuyện mới' &&
    session.messages.length === 0
  ) {
    const newTitle = userText.length > 60
      ? userText.slice(0, 57) + '...'
      : userText;
    await updateSessionTitle(sessionId, user.userId, newTitle);
  }

  return NextResponse.json({
    userMessage,
    assistantMessage,
    usage: { tokensIn, tokensOut },
  });
}
