// POST /api/projects/[id]/files
//
// Upload 1 file vào project (multipart/form-data). Parse content theo
// file-parser.ts, lưu cả disk lẫn DB.
//
// Body: FormData với field "file" (File object) - browser tự gửi.
// Maxsize: 20 MB (xem file-parser.MAX_FILE_BYTES).

import { type NextRequest, NextResponse } from 'next/server';
import { randomUUID, createHash } from 'node:crypto';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getProjectForUser, createFile } from '@/lib/queries/projects';
import { parseFile, MAX_FILE_BYTES } from '@/lib/projects/file-parser';
import { writeProjectFile } from '@/lib/projects/storage';

export const runtime = 'nodejs';
export const maxDuration = 120; // PDF parse có thể chậm

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId } = await params;
  if (!UUID_RE.test(projectId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Verify ownership trước khi parse (parse PDF có thể tốn 1-2s)
  const project = await getProjectForUser(projectId, user.userId);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Invalid multipart body — gửi FormData với field "file"' },
      { status: 400 }
    );
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Field "file" thiếu hoặc không phải File' },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `File quá lớn: ${(file.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
      },
      { status: 413 }
    );
  }

  const filename = file.name || 'untitled';
  const mimeType = file.type || 'application/octet-stream';

  const buffer = Buffer.from(await file.arrayBuffer());

  // Parse content (extract text từ PDF/DOCX/MD/...)
  let parseResult;
  try {
    parseResult = await parseFile(filename, mimeType, buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Parse failed';
    return NextResponse.json({ error: `Không parse được file: ${msg}` }, { status: 400 });
  }

  // Compute sha256 của content_text (nếu có) — để client cache invalidation
  const contentSha256 = parseResult.text
    ? createHash('sha256').update(parseResult.text).digest('hex')
    : null;

  // Write file gốc xuống disk
  const fileId = randomUUID();
  let storagePath: string | null = null;
  try {
    storagePath = await writeProjectFile(projectId, fileId, filename, buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Disk write failed';
    return NextResponse.json({ error: `Lưu disk lỗi: ${msg}` }, { status: 500 });
  }

  // Insert/upsert DB
  const dbFile = await createFile({
    projectId,
    filename,
    mimeType,
    sizeBytes: file.size,
    contentText: parseResult.text,
    storagePath,
    contentSha256,
  });

  return NextResponse.json(
    {
      file: dbFile,
      isBinaryUnsupported: parseResult.isBinaryUnsupported,
      truncated: parseResult.truncated,
      pageCount: parseResult.pageCount,
    },
    { status: 201 }
  );
}
