// DB queries cho project + project_file + project_chat_session +
// project_chat_message. Privacy: tất cả filter theo owner_id (user_id).

import { db } from '@/lib/db';
import type { MessageAttachment } from '@/lib/chat-attachments/storage';

// ─── Types ──────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  instructions: string;
  icon: string | null;
  colorHex: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  totalContentChars: number;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentText: string;
  storagePath: string | null;
  contentSha256: string | null;
  createdAt: string;
}

export type ProjectChatRole = 'user' | 'assistant';

export interface ProjectChatSession {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  totalTokensIn: number;
  totalTokensOut: number;
  messageCount: number;
}

export interface ProjectChatMessage {
  id: string;
  sessionId: string;
  role: ProjectChatRole;
  content: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
  attachments: MessageAttachment[];
}

// ─── Project CRUD ───────────────────────────────────────────────────────

interface ProjectRowWithAggs {
  id: string;
  owner_id: string;
  name: string;
  instructions: string;
  icon: string | null;
  color_hex: string | null;
  created_at: string;
  updated_at: string;
  file_count: string;
  total_content_chars: string;
}

function mapProjectRow(row: ProjectRowWithAggs): Project {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    instructions: row.instructions,
    icon: row.icon,
    colorHex: row.color_hex,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fileCount: Number(row.file_count),
    totalContentChars: Number(row.total_content_chars),
  };
}

const PROJECT_SELECT_WITH_AGGS = `
  SELECT p.id, p.owner_id, p.name, p.instructions, p.icon, p.color_hex,
         p.created_at::TEXT, p.updated_at::TEXT,
         COALESCE(COUNT(f.id), 0)::TEXT             AS file_count,
         COALESCE(SUM(length(f.content_text)), 0)::TEXT AS total_content_chars
    FROM project p
    LEFT JOIN project_file f ON f.project_id = p.id`;

export async function listProjectsForUser(userId: string): Promise<Project[]> {
  const res = await db.query<ProjectRowWithAggs>(
    `${PROJECT_SELECT_WITH_AGGS}
      WHERE p.owner_id = $1
      GROUP BY p.id
      ORDER BY p.updated_at DESC`,
    [userId]
  );
  return res.rows.map(mapProjectRow);
}

export async function getProjectForUser(
  projectId: string,
  userId: string
): Promise<Project | null> {
  const res = await db.query<ProjectRowWithAggs>(
    `${PROJECT_SELECT_WITH_AGGS}
      WHERE p.id = $1 AND p.owner_id = $2
      GROUP BY p.id`,
    [projectId, userId]
  );
  return res.rows[0] ? mapProjectRow(res.rows[0]) : null;
}

export interface CreateProjectInput {
  ownerId: string;
  name: string;
  instructions?: string;
  icon?: string | null;
  colorHex?: string | null;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const res = await db.query<ProjectRowWithAggs>(
    `WITH ins AS (
       INSERT INTO project (owner_id, name, instructions, icon, color_hex)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *
     )
     SELECT ins.id, ins.owner_id, ins.name, ins.instructions, ins.icon, ins.color_hex,
            ins.created_at::TEXT, ins.updated_at::TEXT,
            '0'::TEXT AS file_count,
            '0'::TEXT AS total_content_chars
       FROM ins`,
    [
      input.ownerId,
      input.name.trim(),
      input.instructions ?? '',
      input.icon ?? null,
      input.colorHex ?? null,
    ]
  );
  const row = res.rows[0];
  if (!row) throw new Error('Failed to create project');
  return mapProjectRow(row);
}

export async function updateProject(
  projectId: string,
  userId: string,
  patch: {
    name?: string;
    instructions?: string;
    icon?: string | null;
    colorHex?: string | null;
  }
): Promise<boolean> {
  // COALESCE pattern — chỉ cập nhật field nào caller truyền.
  const res = await db.query(
    `UPDATE project
        SET name = COALESCE($3, name),
            instructions = COALESCE($4, instructions),
            icon = $5,
            color_hex = $6,
            updated_at = NOW()
      WHERE id = $1 AND owner_id = $2`,
    [
      projectId,
      userId,
      patch.name?.trim() ?? null,
      patch.instructions ?? null,
      // icon/color_hex: explicit null cho phép user xoá → dùng `??=` không phù hợp
      patch.icon === undefined ? null : patch.icon,
      patch.colorHex === undefined ? null : patch.colorHex,
    ]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function deleteProject(
  projectId: string,
  userId: string
): Promise<boolean> {
  const res = await db.query(
    `DELETE FROM project WHERE id = $1 AND owner_id = $2`,
    [projectId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ─── Project files ──────────────────────────────────────────────────────

function mapFileRow(row: {
  id: string;
  project_id: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  content_text: string;
  storage_path: string | null;
  content_sha256: string | null;
  created_at: string;
}): ProjectFile {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    contentText: row.content_text,
    storagePath: row.storage_path,
    contentSha256: row.content_sha256,
    createdAt: row.created_at,
  };
}

export async function listFilesForProject(
  projectId: string
): Promise<ProjectFile[]> {
  const res = await db.query(
    `SELECT id, project_id, filename, mime_type, size_bytes::TEXT,
            content_text, storage_path, content_sha256, created_at::TEXT
       FROM project_file
      WHERE project_id = $1
      ORDER BY created_at DESC`,
    [projectId]
  );
  return res.rows.map(mapFileRow);
}

export interface CreateFileInput {
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentText: string;
  storagePath: string | null;
  contentSha256: string | null;
}

export async function createFile(input: CreateFileInput): Promise<ProjectFile> {
  // ON CONFLICT (project_id, filename) DO UPDATE — re-upload cùng tên =
  // replace nội dung cũ (UX giống Google Drive).
  const res = await db.query(
    `INSERT INTO project_file
       (project_id, filename, mime_type, size_bytes, content_text,
        storage_path, content_sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (project_id, filename) DO UPDATE
       SET mime_type = EXCLUDED.mime_type,
           size_bytes = EXCLUDED.size_bytes,
           content_text = EXCLUDED.content_text,
           storage_path = EXCLUDED.storage_path,
           content_sha256 = EXCLUDED.content_sha256,
           created_at = NOW()
     RETURNING id, project_id, filename, mime_type, size_bytes::TEXT,
               content_text, storage_path, content_sha256, created_at::TEXT`,
    [
      input.projectId,
      input.filename,
      input.mimeType,
      input.sizeBytes,
      input.contentText,
      input.storagePath,
      input.contentSha256,
    ]
  );
  const row = res.rows[0];
  if (!row) throw new Error('Failed to create file');
  return mapFileRow(row);
}

/** Trả storage_path cũ để caller có thể xoá file disk. */
export async function deleteFile(
  fileId: string,
  projectId: string
): Promise<{ deleted: boolean; storagePath: string | null }> {
  const res = await db.query<{ storage_path: string | null }>(
    `DELETE FROM project_file
      WHERE id = $1 AND project_id = $2
      RETURNING storage_path`,
    [fileId, projectId]
  );
  const row = res.rows[0];
  return { deleted: !!row, storagePath: row?.storage_path ?? null };
}

// ─── Project chat sessions ─────────────────────────────────────────────

function mapSessionRow(row: {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
  total_tokens_in: string;
  total_tokens_out: string;
  message_count: string;
}): ProjectChatSession {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    title: row.title,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalTokensIn: Number(row.total_tokens_in),
    totalTokensOut: Number(row.total_tokens_out),
    messageCount: Number(row.message_count),
  };
}

export async function listProjectSessions(
  projectId: string,
  userId: string
): Promise<ProjectChatSession[]> {
  const res = await db.query(
    `SELECT s.id, s.project_id, s.user_id, s.title, s.model,
            s.created_at::TEXT, s.updated_at::TEXT,
            COALESCE(SUM(m.tokens_in), 0)::TEXT  AS total_tokens_in,
            COALESCE(SUM(m.tokens_out), 0)::TEXT AS total_tokens_out,
            COUNT(m.id)::TEXT                    AS message_count
       FROM project_chat_session s
       LEFT JOIN project_chat_message m ON m.session_id = s.id
      WHERE s.project_id = $1 AND s.user_id = $2
      GROUP BY s.id
      ORDER BY s.updated_at DESC`,
    [projectId, userId]
  );
  return res.rows.map(mapSessionRow);
}

export async function createProjectSession(
  projectId: string,
  userId: string,
  model: string,
  title: string = 'Cuộc trò chuyện mới'
): Promise<ProjectChatSession> {
  const res = await db.query<{
    id: string;
    created_at: string;
    updated_at: string;
  }>(
    `INSERT INTO project_chat_session (project_id, user_id, model, title)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at::TEXT, updated_at::TEXT`,
    [projectId, userId, model, title]
  );
  const row = res.rows[0];
  if (!row) throw new Error('Failed to create session');
  return {
    id: row.id,
    projectId,
    userId,
    title,
    model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalTokensIn: 0,
    totalTokensOut: 0,
    messageCount: 0,
  };
}

export async function getProjectSessionForUser(
  sessionId: string,
  userId: string
): Promise<(ProjectChatSession & { messages: ProjectChatMessage[] }) | null> {
  const sesRes = await db.query<{
    id: string;
    project_id: string;
    user_id: string;
    title: string;
    model: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, project_id, user_id, title, model,
            created_at::TEXT, updated_at::TEXT
       FROM project_chat_session
      WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  const session = sesRes.rows[0];
  if (!session) return null;

  const msgRes = await db.query<{
    id: string;
    session_id: string;
    role: ProjectChatRole;
    content: string;
    tokens_in: number;
    tokens_out: number;
    created_at: string;
    attachments: MessageAttachment[] | null;
  }>(
    `SELECT id, session_id, role, content, tokens_in, tokens_out,
            created_at::TEXT, attachments
       FROM project_chat_message
      WHERE session_id = $1
      ORDER BY created_at ASC, id ASC`,
    [sessionId]
  );

  const messages: ProjectChatMessage[] = msgRes.rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    content: r.content,
    tokensIn: r.tokens_in,
    tokensOut: r.tokens_out,
    createdAt: r.created_at,
    attachments: Array.isArray(r.attachments) ? r.attachments : [],
  }));

  return {
    id: session.id,
    projectId: session.project_id,
    userId: session.user_id,
    title: session.title,
    model: session.model,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    totalTokensIn: messages.reduce((s, m) => s + m.tokensIn, 0),
    totalTokensOut: messages.reduce((s, m) => s + m.tokensOut, 0),
    messageCount: messages.length,
    messages,
  };
}

export async function appendProjectMessage(
  sessionId: string,
  role: ProjectChatRole,
  content: string,
  tokensIn: number,
  tokensOut: number,
  attachments: MessageAttachment[] = []
): Promise<ProjectChatMessage> {
  const res = await db.query<{
    id: string;
    session_id: string;
    role: ProjectChatRole;
    content: string;
    tokens_in: number;
    tokens_out: number;
    created_at: string;
    attachments: MessageAttachment[] | null;
  }>(
    `INSERT INTO project_chat_message
       (session_id, role, content, tokens_in, tokens_out, attachments)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, session_id, role, content, tokens_in, tokens_out,
               created_at::TEXT, attachments`,
    [sessionId, role, content, tokensIn, tokensOut, JSON.stringify(attachments)]
  );
  const row = res.rows[0];
  if (!row) throw new Error('Failed to append message');

  // Bump session.updated_at để sort list theo activity gần nhất
  await db.query(`UPDATE project_chat_session SET updated_at = NOW() WHERE id = $1`, [
    sessionId,
  ]);

  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    createdAt: row.created_at,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
  };
}

export async function updateProjectSessionTitle(
  sessionId: string,
  userId: string,
  title: string
): Promise<boolean> {
  const res = await db.query(
    `UPDATE project_chat_session SET title = $3 WHERE id = $1 AND user_id = $2`,
    [sessionId, userId, title.trim().slice(0, 200)]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function deleteProjectSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const res = await db.query(
    `DELETE FROM project_chat_session WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}
