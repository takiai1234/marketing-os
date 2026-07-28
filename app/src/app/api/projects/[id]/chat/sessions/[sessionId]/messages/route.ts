// POST /api/projects/[id]/chat/sessions/[sessionId]/messages
//
// Send user message (text + optional file/image attachments) → kie.ai chat
// → save assistant reply.
//
// Body: multipart/form-data
//   - field "content"  : string (text user gõ)
//   - field "files"    : 0..N File (attachments, max 8 files / 60 MB tổng)
//
// File text-extractable (PDF/DOCX/MD) → inject text vào prompt
// Image → gửi qua content block "image" (vision-capable model)
//
// System prompt = project.instructions + concat all project_file content
// (knowledge persistent) — KHÁC với attachments (per-message, ad-hoc).

import { type NextRequest, NextResponse } from 'next/server';
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
  isOpenRouterConfigured,
  isValidModelId,
  type ChatMessageInput,
  type ChatContentBlock,
} from '@/lib/llm/openrouter';
import { processAttachments } from '@/lib/chat-attachments/process';
import type { MessageAttachment } from '@/lib/chat-attachments/storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx {
  params: Promise<{ id: string; sessionId: string }>;
}

// Cap knowledge text trong system prompt — 200K chars ≈ 50K tokens, để dành
// ~150K tokens cho history + user message + assistant output. Claude/GPT-5/
// Gemini context window 200K-1M tùy model, nhưng kie.ai có thể reject sớm.
const MAX_KNOWLEDGE_CHARS = 200_000;

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

/** Build user message content khi có cả text + attachments. */
function buildUserContent(
  userText: string,
  extraBlocks: ChatContentBlock[]
): string | ChatContentBlock[] {
  if (extraBlocks.length === 0) return userText;
  // Text user gõ luôn đặt đầu, attachments theo sau
  const blocks: ChatContentBlock[] = [];
  if (userText.trim()) blocks.push({ type: 'text', text: userText });
  blocks.push(...extraBlocks);
  return blocks;
}

/** Re-build user message content cho history (assistant cũ vẫn cần "thấy"
 *  ảnh đính kèm để follow-up). Convert từ DB attachments[] → blocks.
 *  Note: image blocks dùng URL serve qua /api/chat-attachments/[messageId]/[attId]
 *  thay vì re-encode base64 — tiết kiệm RAM + transfer. Codex/Gemini accept URL;
 *  Anthropic CẦN base64 nên buộc read disk + encode lại. Tạm thời bỏ qua image
 *  trong history (Anthropic, Codex, Gemini đều có short-term memory hỗ trợ),
 *  chỉ ghi placeholder text — user thường follow-up bằng text nên không cần
 *  re-send full image. Production có thể optimize sau.
 */
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
    // Catch-all — log full stack ra container stdout để Coolify logs bắt được,
    // trả về 500 với message rõ ràng thay vì để Next.js raw 500 HTML.
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : '';
    console.error(`[POST /projects/chat/messages] UNHANDLED:`, msg, '\n', stack);
    return NextResponse.json(
      { error: `Lỗi server: ${msg}` },
      { status: 500 }
    );
  }
}

async function handlePost(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  if (!(await isOpenRouterConfigured())) {
    return NextResponse.json(
      { error: 'NINE_ROUTER_API_KEY chưa cấu hình. Admin vào /settings/integrations để set.' },
      { status: 503 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId, sessionId } = await params;
  if (!UUID_RE.test(projectId) || !UUID_RE.test(sessionId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Parse multipart
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

  // Verify session ownership
  const session = await getProjectSessionForUser(sessionId, user.userId);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.projectId !== projectId) {
    return NextResponse.json({ error: 'Session does not belong to this project' }, { status: 400 });
  }
  if (!isValidModelId(session.model)) {
    return NextResponse.json(
      { error: `Model "${session.model}" không còn hỗ trợ — tạo cuộc trò chuyện mới.` },
      { status: 400 }
    );
  }

  // Process attachments (save disk + extract text + build LLM blocks)
  let attResult;
  try {
    attResult = await processAttachments(sessionId, files);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Process attachments failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Project context
  const project = await getProjectForUser(projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const projectFiles = await listFilesForProject(projectId);
  const systemPrompt = buildSystemPrompt(
    project.name,
    project.instructions,
    projectFiles.map((f) => ({ filename: f.filename, contentText: f.contentText }))
  );

  // Persist user message TRƯỚC khi call LLM
  const userMessage = await appendProjectMessage(
    sessionId,
    'user',
    userText,
    0,
    0,
    attResult.attachments
  );

  // Build messages array cho kie.ai
  const historyMessages: ChatMessageInput[] = session.messages.map((m) => ({
    role: m.role,
    content: rebuildHistoryContent(m.content, m.attachments),
  }));
  const messagesForLlm: ChatMessageInput[] = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: buildUserContent(userText, attResult.llmBlocks) },
  ];

  // Call kie.ai
  let assistantText = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let finishReason = 'stop';

  try {
    const result = await chatComplete({
      model: session.model,
      messages: messagesForLlm,
      maxTokens: 16000, // ↑ từ 8192 — tránh cắt response cho bài dài
    });
    assistantText = result.content;
    tokensIn = result.tokensIn;
    tokensOut = result.tokensOut;
    finishReason = result.finishReason;
    if (!assistantText) {
      assistantText = '(Model không trả về nội dung — có thể bị filter hoặc context quá dài.)';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'kie.ai API error';
    const stack = err instanceof Error ? err.stack : '';
    console.error(
      `[POST /projects/chat/messages] kie.ai ERROR model=${session.model} sessionId=${sessionId}:`,
      msg,
      '\n',
      stack
    );
    await appendProjectMessage(
      sessionId,
      'assistant',
      `❌ Lỗi gọi LLM: ${msg}\n\nThử lại bằng nút send hoặc đổi model khác.`,
      0,
      0,
      []
    );
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const assistantMessage = await appendProjectMessage(
    sessionId,
    'assistant',
    assistantText,
    tokensIn,
    tokensOut,
    []
  );

  // Auto-set session title
  if (session.title === 'Cuộc trò chuyện mới' && session.messages.length === 0) {
    const firstFile = files[0];
    const titleSource =
      userText.trim() || (firstFile ? `Hỏi về ${firstFile.name}` : 'Cuộc trò chuyện mới');
    const newTitle = titleSource.length > 60 ? titleSource.slice(0, 57) + '...' : titleSource;
    await updateProjectSessionTitle(sessionId, user.userId, newTitle);
  }

  return NextResponse.json({
    userMessage,
    assistantMessage,
    usage: { tokensIn, tokensOut },
    warnings: attResult.warnings,
    // 'length' = bị cắt vì max_tokens → client hiện nút "Viết tiếp"
    finishReason,
  });
}
