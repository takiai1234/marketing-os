// POST /api/projects/[id]/chat/sessions/[sessionId]/messages
//
// Send user message → call kie.ai chat với system prompt build từ
// (instructions + concat all file content_text) → save assistant reply →
// trả về.
//
// System prompt format:
//   {project.instructions}
//
//   --- KNOWLEDGE FILES ---
//   ## <filename1>
//   {content_text 1}
//
//   ## <filename2>
//   {content_text 2}
//   ...

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/get-session';
import {
  getProjectForUser,
  getProjectSessionForUser,
  appendProjectMessage,
  updateProjectSessionTitle,
  listFilesForProject,
} from '@/lib/queries/projects';
import {
  chatComplete,
  isKieConfigured,
  isValidChatModelId,
} from '@/lib/llm/kie-ai';

export const runtime = 'nodejs';
export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  content: z.string().trim().min(1).max(50_000),
});

interface Ctx {
  params: Promise<{ id: string; sessionId: string }>;
}

/** Cap tổng knowledge text trong prompt — tránh nổ context window
 *  (Claude/GPT-5 max ~200K tokens ≈ ~600K chars). 400K an toàn. */
const MAX_KNOWLEDGE_CHARS = 400_000;

function buildSystemPrompt(
  projectName: string,
  instructions: string,
  files: Array<{ filename: string; contentText: string }>
): string {
  const parts: string[] = [];

  parts.push(`Bạn là AI assistant trong project "${projectName}".`);

  if (instructions.trim()) {
    parts.push(`\n## HƯỚNG DẪN (custom instructions)\n\n${instructions.trim()}`);
  }

  const filesWithContent = files.filter((f) => f.contentText.trim().length > 0);
  if (filesWithContent.length > 0) {
    parts.push(`\n## KNOWLEDGE FILES\n\nProject này có ${filesWithContent.length} file knowledge — tham khảo khi trả lời:`);

    let totalChars = 0;
    for (const f of filesWithContent) {
      const remaining = MAX_KNOWLEDGE_CHARS - totalChars;
      if (remaining <= 0) {
        parts.push(`\n[... ${filesWithContent.length - filesWithContent.indexOf(f)} file còn lại bị bỏ qua do vượt context limit]`);
        break;
      }
      let body = f.contentText;
      if (body.length > remaining) {
        body = body.slice(0, remaining) + '\n[... TRUNCATED ...]';
      }
      parts.push(`\n### File: ${f.filename}\n\n${body}`);
      totalChars += body.length;
    }
  }

  return parts.join('\n');
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!(await isKieConfigured())) {
    return NextResponse.json(
      { error: 'KIE_AI_API_KEY chưa cấu hình. Admin vào /settings/integrations để set.' },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId, sessionId } = await params;
  if (!UUID_RE.test(projectId) || !UUID_RE.test(sessionId)) {
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

  // 1. Load session + verify ownership + cross-check project
  const session = await getProjectSessionForUser(sessionId, user.userId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.projectId !== projectId) {
    return NextResponse.json({ error: 'Session does not belong to this project' }, { status: 400 });
  }

  if (!isValidChatModelId(session.model)) {
    return NextResponse.json(
      {
        error: `Model "${session.model}" không còn hỗ trợ — tạo cuộc trò chuyện mới.`,
      },
      { status: 400 }
    );
  }

  // 2. Load project metadata + files để build system prompt
  const project = await getProjectForUser(projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const files = await listFilesForProject(projectId);
  const systemPrompt = buildSystemPrompt(
    project.name,
    project.instructions,
    files.map((f) => ({ filename: f.filename, contentText: f.contentText }))
  );

  // 3. Persist user message TRƯỚC khi call LLM
  const userMessage = await appendProjectMessage(sessionId, 'user', userText, 0, 0);

  // 4. Call kie.ai
  let assistantText = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const result = await chatComplete({
      model: session.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...session.messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userText },
      ],
      maxTokens: 8192,
    });

    assistantText = result.content;
    tokensIn = result.tokensIn;
    tokensOut = result.tokensOut;

    if (!assistantText) {
      assistantText =
        '(Model không trả về nội dung — có thể bị filter hoặc context quá dài.)';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'kie.ai API error';
    await appendProjectMessage(
      sessionId,
      'assistant',
      `❌ Lỗi gọi LLM: ${msg}\n\nThử lại bằng nút send hoặc đổi model khác.`,
      0,
      0
    );
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 5. Persist assistant message
  const assistantMessage = await appendProjectMessage(
    sessionId,
    'assistant',
    assistantText,
    tokensIn,
    tokensOut
  );

  // 6. Auto-set session title từ first user message
  if (session.title === 'Cuộc trò chuyện mới' && session.messages.length === 0) {
    const newTitle =
      userText.length > 60 ? userText.slice(0, 57) + '...' : userText;
    await updateProjectSessionTitle(sessionId, user.userId, newTitle);
  }

  return NextResponse.json({
    userMessage,
    assistantMessage,
    usage: { tokensIn, tokensOut },
  });
}
