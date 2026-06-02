// Storage helpers cho Project knowledge files. Tách riêng skills/ để
// 2 feature dùng path khác nhau, dễ debug + swap backend riêng.

import { mkdir, writeFile, unlink, rm } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

// Default fallback cho local dev. Production set PROJECT_STORAGE_PATH=
//   /app/storage/projects (mount Coolify persistent volume).
const DEFAULT_STORAGE = './storage/projects';

export function getProjectStorageDir(): string {
  const dir = process.env.PROJECT_STORAGE_PATH || DEFAULT_STORAGE;
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

/**
 * Path layout: <root>/<projectId>/<fileId>__<sanitizedFilename>
 *
 * fileId là UUID internal → unique luôn, không cần lo collision khi user
 * upload 2 file cùng tên trong 2 project (bảng project_file đã unique
 * filename PER project rồi).
 *
 * Đính filename vào path để khi debug/inspect disk thấy ngay file gì,
 * không phải lookup DB.
 */
function sanitizeFilename(name: string): string {
  // Strip path traversal + control chars. Giữ Unicode (Vietnamese OK).
  return name
    .replace(/[\\/]/g, '_')
    .replace(/[\x00-\x1F]/g, '')
    .slice(0, 200);
}

export function buildProjectFilePath(
  projectId: string,
  fileId: string,
  filename: string
): string {
  const root = getProjectStorageDir();
  const dir = resolve(root, projectId);
  const full = resolve(dir, `${fileId}__${sanitizeFilename(filename)}`);
  // Defense-in-depth: ensure resolved path không escape khỏi storage dir
  if (!full.startsWith(resolve(root))) {
    throw new Error('Path traversal detected');
  }
  return full;
}

export async function ensureProjectDir(projectId: string): Promise<void> {
  const root = getProjectStorageDir();
  const dir = resolve(root, projectId);
  if (!dir.startsWith(resolve(root))) {
    throw new Error('Path traversal detected');
  }
  await mkdir(dir, { recursive: true });
}

export async function writeProjectFile(
  projectId: string,
  fileId: string,
  filename: string,
  buffer: Buffer
): Promise<string> {
  await ensureProjectDir(projectId);
  const path = buildProjectFilePath(projectId, fileId, filename);
  await writeFile(path, buffer);
  // Trả path RELATIVE so với root để lưu DB (root có thể đổi giữa env, path
  // absolute sẽ sai khi migrate giữa các môi trường)
  const root = getProjectStorageDir();
  return path.startsWith(root) ? path.slice(root.length).replace(/^[/\\]/, '') : path;
}

export async function deleteProjectFile(relativePath: string): Promise<void> {
  if (!relativePath) return;
  const root = getProjectStorageDir();
  const full = resolve(root, relativePath);
  if (!full.startsWith(resolve(root))) {
    // KHÔNG throw — chỉ skip để không crash route DELETE
    return;
  }
  try {
    await unlink(full);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/** Xoá toàn bộ folder của project (khi project bị delete) */
export async function deleteProjectDir(projectId: string): Promise<void> {
  const root = getProjectStorageDir();
  const dir = resolve(root, projectId);
  if (!dir.startsWith(resolve(root))) return;
  await rm(dir, { recursive: true, force: true });
}
