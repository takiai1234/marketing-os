-- Migration 062: Seed briefs_persona mặc định.
-- Trước đây personas chỉ có qua scripts/seed-briefs.ts (dev seed) — production
-- chưa bao giờ chạy nên tạo brief fail: 'Persona "AI for Founder" không tồn tại'.
-- Chuyển sang migration để mọi môi trường tự có sau deploy. Idempotent.

INSERT INTO briefs_persona (name, dot_color)
VALUES
  ('AI for Founder', 'bg-rose-500'),
  ('Solopreneur',    'bg-amber-500')
ON CONFLICT (name) DO NOTHING;
