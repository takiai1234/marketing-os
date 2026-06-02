// Build prompt cho feature "Viết lại bài viết tương tự".
//
// 2 source type:
//   - library_post: bài đã đăng trên kênh của user (có engagement context)
//   - news:        tin tức AI ingest từ RSS bên ngoài
//
// Output: system prompt + user prompt riêng. Caller (api/rewrite/route.ts)
// nối thành messages array cho chatComplete().

export type RewriteSourceType = 'library_post' | 'news';

export type RewriteTone =
  | 'professional'   // Trang trọng, chuyên gia
  | 'friendly'       // Thân thiện, gần gũi
  | 'gen-z'          // Trẻ trung, gen-z, viral
  | 'storytelling'   // Kể chuyện, cảm xúc
  | 'analytical';    // Phân tích, data-driven

export type RewritePlatform =
  | 'facebook_post'  // Facebook post text dài (300-800 chars)
  | 'facebook_reel'  // Script video Reel ngắn (60-90s)
  | 'tiktok'         // Script TikTok (30-60s)
  | 'threads'        // Threads short text (max 500 chars)
  | 'blog'           // Bài blog dài (800+ words)
  | 'instagram';     // Instagram caption (hashtag heavy)

export type RewriteLength = 'short' | 'medium' | 'long';

const TONE_GUIDE: Record<RewriteTone, string> = {
  professional:
    'Trang trọng, chuyên nghiệp, từ vựng chuẩn mực. Dùng cho audience B2B hoặc khách hàng cao cấp.',
  friendly:
    'Thân thiện, gần gũi, dùng "bạn" "mình" thay vì "quý khách". Tone đại chúng, dễ tiếp cận.',
  'gen-z':
    'Trẻ trung, slang vừa phải (fr, fr fr, slay, bestie, lit), nhiều emoji, ngắn gọn punchy. Hướng audience 16-25 tuổi.',
  storytelling:
    'Kể chuyện cảm xúc, mở đầu bằng tình huống cụ thể, dùng "tôi"/"chúng tôi". Có khoảng lặng, plot twist, đoạn kết đọng.',
  analytical:
    'Phân tích data-driven, số liệu cụ thể, có cấu trúc rõ (Vấn đề → Phân tích → Giải pháp). Trích nguồn nếu có.',
};

const PLATFORM_GUIDE: Record<RewritePlatform, string> = {
  facebook_post:
    'Facebook post dạng text. Mở đầu bằng hook 1-2 câu thu hút. Đoạn body 3-5 đoạn. Kết bằng CTA hoặc câu hỏi tương tác. Có thể dùng emoji vừa phải.',
  facebook_reel:
    'Script video Facebook Reel 60-90 giây. Format:\n[0-3s] Hook visual + lời thoại\n[4-25s] Setup vấn đề\n[26-60s] Giải pháp / story\n[60-90s] CTA + closing\nMỗi cảnh phân cách bằng [time-stamp]. Lời thoại tự nhiên, không đọc văn bản.',
  tiktok:
    'Script TikTok 30-60 giây. Hook 0-3s phải bùng nổ. Pacing nhanh. Có on-screen text gợi ý mỗi cảnh ([TEXT: "..."]). Kết bằng CTA hoặc thử thách.',
  threads:
    'Threads post ngắn (max 500 chars). 1-2 câu hook + 2-3 câu body + 1 câu kết. Có thể dùng line break tạo nhịp. Ít emoji.',
  blog:
    'Bài blog dài. Có H2 / H3 phân chia section. Mở bài, 3-4 phần thân, kết bài. 800-1500 từ.',
  instagram:
    'Caption Instagram. Hook 1 câu. Body 2-3 đoạn ngắn. Kết bằng câu hỏi tương tác. Cuối caption: 8-15 hashtag liên quan (#chủ-đề-chính #ngách #brand).',
};

const LENGTH_GUIDE: Record<RewriteLength, string> = {
  short: 'Rất ngắn — 80-150 từ. Cô đọng, chỉ ý chính.',
  medium: 'Vừa — 200-400 từ. Đủ context, 2-3 ý chính.',
  long: 'Dài — 500+ từ. Phân tích sâu, nhiều ví dụ.',
};

export interface RewriteParams {
  sourceType: RewriteSourceType;
  /** Nội dung gốc — Library: post.content. News: title + "\n\n" + excerpt */
  sourceContent: string;
  /** Optional: tên kênh (Library) hoặc nguồn tin (News) — context cho AI */
  sourceContext: string | null;
  /** Optional: platform của bài gốc (Library only) — facebook/instagram/... */
  sourcePlatform: string | null;
  tone: RewriteTone;
  platform: RewritePlatform;
  length: RewriteLength;
  /** Hướng dẫn riêng từ user — paste thêm thông tin, sản phẩm, ... */
  customInstructions: string;
}

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildRewritePrompt(params: RewriteParams): BuiltPrompt {
  const parts: string[] = [];

  parts.push(
    `Bạn là chuyên gia content marketing tiếng Việt, thành thạo viết bài cho social media (Facebook, TikTok, Instagram, Threads, Reels) và blog dài.`,
    ``,
    `## NHIỆM VỤ`,
    `Đọc bài viết gốc của user (cuối prompt) và VIẾT LẠI 1 bài tương tự nhưng khác hẳn về câu chữ — không phải paraphrase. Giữ:`,
    `- Cùng chủ đề / thông điệp chính`,
    `- Cùng pain point / insight cốt lõi`,
    `Đổi hoàn toàn:`,
    `- Hook mở bài (cách dẫn vào)`,
    `- Cấu trúc đoạn`,
    `- Câu chữ + ví dụ cụ thể`,
    `- Tone (theo yêu cầu)`,
    ``,
    `## TONE`,
    TONE_GUIDE[params.tone],
    ``,
    `## ĐỊNH DẠNG XUẤT (${params.platform})`,
    PLATFORM_GUIDE[params.platform],
    ``,
    `## ĐỘ DÀI`,
    LENGTH_GUIDE[params.length],
    ``
  );

  if (params.customInstructions.trim()) {
    parts.push(
      `## YÊU CẦU RIÊNG TỪ USER`,
      params.customInstructions.trim(),
      ``
    );
  }

  parts.push(
    `## QUY TẮC OUTPUT`,
    `- TRẢ THẲNG nội dung viết lại — KHÔNG có lời giới thiệu kiểu "Đây là bài viết...", KHÔNG ghi "Bài viết:", KHÔNG có markdown code block.`,
    `- Tiếng Việt có dấu, không dịch máy.`,
    `- Không sao chép NGUYÊN VĂN bất kỳ câu nào từ bài gốc. Câu chữ phải khác hoàn toàn.`,
    `- Nếu bài gốc tiếng Anh, dịch sang tiếng Việt thuần Việt.`,
    `- KHÔNG fabricate số liệu cụ thể không có trong bài gốc (vd ROI, conversion rate). Nếu cần ví dụ số, ghi "vd: 20-30%" thay vì khẳng định.`
  );

  // ─── User message: source content ─────────────────────────────────────

  const sourceLabel =
    params.sourceType === 'news'
      ? 'TIN TỨC GỐC (từ media)'
      : 'BÀI ĐĂNG GỐC (đã đăng trên kênh)';

  const contextLine =
    params.sourceContext != null && params.sourceContext.trim()
      ? `Nguồn: ${params.sourceContext}${params.sourcePlatform ? ` (${params.sourcePlatform})` : ''}\n\n`
      : '';

  const userMessage = `## ${sourceLabel}\n\n${contextLine}${params.sourceContent.trim()}\n\n## YÊU CẦU\nViết lại theo system instructions. Trả thẳng nội dung mới.`;

  return {
    system: parts.join('\n'),
    user: userMessage,
  };
}

// ─── UI option lists (export để form picker dùng) ─────────────────────

export const TONE_OPTIONS: ReadonlyArray<{ value: RewriteTone; label: string; hint: string }> = [
  { value: 'friendly', label: 'Thân thiện', hint: 'gần gũi, đại chúng' },
  { value: 'professional', label: 'Chuyên nghiệp', hint: 'trang trọng, B2B' },
  { value: 'gen-z', label: 'Gen Z', hint: 'trẻ, viral, nhiều emoji' },
  { value: 'storytelling', label: 'Kể chuyện', hint: 'cảm xúc, plot twist' },
  { value: 'analytical', label: 'Phân tích', hint: 'data-driven, có cấu trúc' },
];

export const PLATFORM_OPTIONS: ReadonlyArray<{ value: RewritePlatform; label: string }> = [
  { value: 'facebook_post', label: 'Facebook post (text)' },
  { value: 'facebook_reel', label: 'Facebook Reel (script)' },
  { value: 'tiktok', label: 'TikTok (script)' },
  { value: 'threads', label: 'Threads' },
  { value: 'instagram', label: 'Instagram caption' },
  { value: 'blog', label: 'Blog dài' },
];

export const LENGTH_OPTIONS: ReadonlyArray<{ value: RewriteLength; label: string; hint: string }> = [
  { value: 'short', label: 'Ngắn', hint: '80-150 từ' },
  { value: 'medium', label: 'Vừa', hint: '200-400 từ' },
  { value: 'long', label: 'Dài', hint: '500+ từ' },
];
