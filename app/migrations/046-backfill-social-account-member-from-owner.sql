-- Migration 046: Backfill social_account_member cho kênh thiếu dòng member.
--
-- Vấn đề: Team KPI (team-kpi-sql.ts) tính HOÀN TOÀN qua bảng social_account_member.
-- Nhưng 2 path tạo kênh chỉ set social_account.owner_member_id, KHÔNG tạo dòng
-- social_account_member:
--   - Bundle finalize (src/lib/bundle/finalize.ts)
--   - FB native connect (src/app/api/channels/route.ts)
-- Migration 024 đã backfill 1 LẦN lúc đó, nhưng mọi kênh connect SAU 024 (đặc
-- biệt kênh TikTok qua Bundle) bị thiếu dòng member → bài viết của kênh đó KHÔNG
-- được cộng vào "Bài viết/Kênh" và các KPI khác.
--
-- Fix (idempotent): tạo dòng primary từ owner_member_id cho mọi kênh chưa có
-- primary. Code ở 2 path cũng được sửa để tự tạo dòng này khi connect (để không
-- tái phát), nhưng migration này dọn dữ liệu hiện có.
INSERT INTO social_account_member (account_id, member_id, role)
SELECT sa.id, sa.owner_member_id, 'primary'
FROM social_account sa
WHERE sa.owner_member_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM social_account_member sam
    WHERE sam.account_id = sa.id AND sam.role = 'primary'
  )
ON CONFLICT DO NOTHING;
