// POST /api/skills/[id]/chat/sessions/[sessionId]/messages
//
// Send user message (text + optional file/image attachments) → kie.ai chat
// → save assistant reply.
//
// Body: multipart/form-data
//   - field "content" : string (text user gõ)
//   - field "files"   : 0..N File (attachments)
//
// Flow giống project chat — chỉ khác system prompt build từ skill bundle
// (loadSkillContent) thay vì project.instructions + project_file.

import { type NextRequest, NextResponse } from 'next/server';
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
import {
  chatComplete,
  isKieConfigured,
  isValidChatModelId,
  type ChatMessageInput,
  type ChatContentBlock,
} from '@/lib/llm/kie-ai';
import { processAttachments } from '@/lib/chat-attachments/process';
import type { MessageAttachment } from '@/lib/chat-attachments/storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx {
  params: Promise<{ id: string; sessionId: string }>;
}

function buildUserContent(
  userText: string,
  extraBlocks: ChatContentBlock[]
): string | ChatContentBlock[] {
  if (extraBlocks.length === 0) return userText;
  const blocks: ChatContentBlock[] = [];
  if (userText.trim()) blocks.push({ type: 'text', text: userText });
  blocks.push(...extraBlocks);
  return blocks;
}

function rebuildHistoryContent(
  content: string,
  attachments: MessageAttachment[]
): string {
  if (attachments.length === 0) return content;
  const parts: string[] = [];
  if (content.trim()) parts.push(content);
  for (const a of attachments) {
    if (a.kind === 'image') {
      parts.push(`[Ảnh đính kèm: ${a.filename}]`);
    } else if (a.contentText) {
      parts.push(`[File ${a.filename}]\n${a.contentText}\n[/${a.filename}]`);
    } else {
      parts.push(`[File ${a.filename} — không có text]`);
    }
  }
  return parts.join('\n\n');
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    return await handlePost(req, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`[POST /skills/chat/messages] UNHANDLED:`, msg, '\n', stack);
    return NextResponse.json(
      { error: `Lỗi server: ${msg}` },
      { status: 500 }
    );
  }
}

async function handlePost(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!(await isKieConfigured())) {
    return NextResponse.json(
      { error: 'KIE_AI_API_KEY chưa cấu hình. Admin vào /settings/integrations để set.' },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: skillId, sessionId } = await params;
  if (!UUID_RE.test(skillId) || !UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Body phải là multipart/form-data với field "content" + "files"' },
      { status: 400 }
    );
  }

  const userText = (formData.get('content') as string | null)?.trim() ?? '';
  const files: File[] = [];
  for (const v of formData.getAll('files')) {
    if (v instanceof File) files.push(v);
  }

  if (!userText && files.length === 0) {
    return NextResponse.json(
      { error: 'Message phải có text hoặc ít nhất 1 attachment' },
      { status: 400 }
    );
  }
  if (userText.length > 50_000) {
    return NextResponse.json({ error: 'Text quá dài (>50K chars)' }, { status: 400 });
  }

  // 1. Load session + verify
  const session = await getSessionForUser(sessionId, user.userId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.skillId !== skillId) {
    return NextResponse.json({ error: 'Session does not belong to this skill' }, { status: 400 });
  }
  if (!isValidChatModelId(session.model)) {
    return NextResponse.json(
      {
        error: `Model "${session.model}" không còn được hỗ trợ. Tạo cuộc trò chuyện mới.`,
      },
      { status: 400 }
    );
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

  // 3. Process attachments
  let attResult;
  try {
    attResult = await processAttachments(sessionId, files);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Process attachments failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 4. Persist user message
  const userMessage = await appendMessage(
    sessionId,
    'user',
    userText,
    0,
    0,
    attResult.attachments
  );

  // 5. Build LLM message array
  const historyMessages: ChatMessageInput[] = session.messages.map((m) => ({
    role: m.role,
    content: rebuildHistoryContent(m.content, m.attachments),
  }));
  const messagesForLlm: ChatMessageInput[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: buildUserContent(userText, attResult.llmBlocks) },
  ];

  // 6. Call kie.ai
  let assistantText = '';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const result = await chatComplete({
      model: session.model,
      messages: messagesForLlm,
      maxTokens: 8192,
    });
    assistantText = result.content;
    tokensIn = result.tokensIn;
    tokensOut = result.tokensOut;
    if (!assistantText) {
      assistantText =
        '(Model không trả về nội dung — có thể bị filter hoặc skill cần tool execution chưa support.)';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'kie.ai API error';
    const stack = err instanceof Error ? err.stack : '';
    console.error(
      `[POST /skills/chat/messages] kie.ai ERROR model=${session.model} sessionId=${sessionId}:`,
      msg,
      '\n',
      stack
    );
    await appendMessage(
      sessionId,
      'assistant',
      `❌ Lỗi gọi LLM: ${msg}\n\nThử lại bằng nút send hoặc đổi model khác.`,
      0,
      0,
      []
    );
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // 7. Persist assistant message
  const assistantMessage = await appendMessage(
    sessionId,
    'assistant',
    assistantText,
    tokensIn,
    tokensOut,
    []
  );

  // 8. Auto-set session title
  if (
    session.title === 'Cuộc trò chuyện mới' &&
    session.messages.length === 0
  ) {
    const firstFile = files[0];
    const titleSource =
      userText.trim() || (firstFile ? `Hỏi về ${firstFile.name}` : 'Cuộc trò chuyện mới');
    const newTitle = titleSource.length > 60 ? titleSource.slice(0, 57) + '...' : titleSource;
    await updateSessionTitle(sessionId, user.userId, newTitle);
  }

  return NextResponse.json({
    userMessage,
    assistantMessage,
    usage: { tokensIn, tokensOut },
    warnings: attResult.warnings,
  });
}
