// Load skill content (text) from zip để inject vào Claude system prompt.
//
// Convention skill bundle: file chính có thể là SKILL.md, README.md, hoặc
// instructions.md. Tìm theo thứ tự ưu tiên. Nếu không có → trả về metadata
// + file tree làm fallback (vẫn cho phép chat, just kém context).

import { readZipTree, readZipEntryText } from './zip-reader';
import { resolveSkillPath } from './storage';

// Tên file ưu tiên — thứ tự = priority (đầu tiên tìm thấy = dùng)
const SKILL_ENTRYPOINT_NAMES = [
  'SKILL.md',
  'skill.md',
  'README.md',
  'readme.md',
  'INSTRUCTIONS.md',
  'instructions.md',
  'main.md',
] as const;

const MAX_SUPPORT_FILE_BYTES = 50_000; // 50KB / file phụ — chống prompt phình
const MAX_TOTAL_BYTES = 200_000;        // 200KB tổng — match Claude prompt cache limit

export interface SkillContent {
  /** File chính (vd SKILL.md) — luôn include nếu có */
  main: string | null;
  /** Tên file main đã tìm thấy */
  mainFilename: string | null;
  /** Các file .md phụ (vd references/, examples/) — concat với separator */
  supporting: string;
  /** File tree summary (vd "skill/, references/foo.md, ...") cho context */
  treeSummary: string;
  /** Có truncate không (vượt MAX_TOTAL_BYTES) */
  truncated: boolean;
}

/**
 * Load skill content cho system prompt.
 * - Tìm main entrypoint (SKILL.md / README.md / ...).
 * - Concat các file .md / .txt phụ trong cùng zip (sub-references).
 * - Cap tổng size để tránh blow up context window.
 */
export function loadSkillContent(storagePath: string): SkillContent {
  const absPath = resolveSkillPath(storagePath);
  const tree = readZipTree(absPath);

  // 1. Pick main entrypoint
  let mainFilename: string | null = null;
  let mainContent: string | null = null;
  for (const candidate of SKILL_ENTRYPOINT_NAMES) {
    // Match either at root or 1 level deep (vd "my-skill/SKILL.md")
    const match = tree.find(
      (e) =>
        !e.isDirectory &&
        (e.name === candidate || e.path.endsWith('/' + candidate))
    );
    if (match) {
      const read = readZipEntryText(absPath, match.path);
      if (read && !read.isBinary) {
        mainFilename = match.path;
        mainContent = read.content;
        break;
      }
    }
  }

  // 2. Build supporting context — text files khác (max 5 files để tránh phình)
  let totalBytes = mainContent?.length ?? 0;
  let truncated = false;
  const supportingParts: string[] = [];

  const textEntries = tree
    .filter((e) => !e.isDirectory)
    .filter((e) => e.path !== mainFilename)
    .filter((e) => /\.(md|txt|markdown|json|yaml|yml)$/i.test(e.name))
    .slice(0, 10); // cap 10 file phụ

  for (const e of textEntries) {
    if (totalBytes >= MAX_TOTAL_BYTES) {
      truncated = true;
      break;
    }
    const read = readZipEntryText(absPath, e.path);
    if (!read || read.isBinary) continue;

    const trimmed =
      read.content.length > MAX_SUPPORT_FILE_BYTES
        ? read.content.slice(0, MAX_SUPPORT_FILE_BYTES) + '\n\n[...truncated]'
        : read.content;

    supportingParts.push(`\n\n### File: ${e.path}\n\n${trimmed}`);
    totalBytes += trimmed.length;
  }

  // 3. Tree summary — list mọi file (không quá 50) cho Claude biết structure
  const treeSummary = tree
    .filter((e) => !e.isDirectory)
    .slice(0, 50)
    .map((e) => `- ${e.path} (${e.size} bytes)`)
    .join('\n');

  return {
    main: mainContent,
    mainFilename,
    supporting: supportingParts.join(''),
    treeSummary,
    truncated,
  };
}

/**
 * Build system prompt từ SkillContent. Format theo convention của
 * Anthropic — wrap context bằng heading rõ ràng.
 */
export function buildSystemPrompt(
  skillName: string,
  content: SkillContent
): string {
  const parts: string[] = [];

  parts.push(`Bạn được trang bị skill "${skillName}" từ thư viện Marketing OS.`);
  parts.push(
    'Tuân theo chính xác hướng dẫn, workflow, tone, và style trong skill này. ' +
      'Output bằng tiếng Việt nếu skill yêu cầu hoặc nếu user dùng tiếng Việt.'
  );

  if (content.main) {
    parts.push(`\n## Hướng dẫn skill (${content.mainFilename})\n\n${content.main}`);
  }

  if (content.supporting) {
    parts.push(`\n## Files tham chiếu kèm theo${content.supporting}`);
  }

  if (content.treeSummary) {
    parts.push(`\n## Cấu trúc skill bundle\n\n${content.treeSummary}`);
  }

  if (content.truncated) {
    parts.push(
      '\n\n[Note: Một số file phụ trong skill bundle đã bị truncate do quá dài. ' +
        'Nếu cần đầy đủ, user có thể download skill và mở local.]'
    );
  }

  if (!content.main) {
    parts.push(
      '\n\n[Note: Skill bundle KHÔNG có SKILL.md / README.md. Bạn chỉ thấy ' +
        'file tree và file phụ. Hỏi user clarify ý định trước khi generate.]'
    );
  }

  return parts.join('\n');
}
