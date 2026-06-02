-- Migration 031: Message attachments
-- Up migration
--
-- Cho phép user đính file + ảnh trực tiếp vào 1 message (không phải knowledge
-- base của project). Khác biệt:
--   - project_file = persistent knowledge, share giữa các chat trong project
--   - message_attachment = ad-hoc, scope 1 message duy nhất
--
-- Schema chọn JSONB column thay vì bảng riêng vì:
--   - Số lượng attachment per message thường nhỏ (max 5-10)
--   - Không có query "list attachments by type" — luôn load chung với message
--   - JSONB array đơn giản, ít JOIN
--
-- Shape mỗi item:
--   {
--     "id": "uuid",
--     "kind": "image" | "file",
--     "filename": "...",
--     "mimeType": "image/jpeg",
--     "sizeBytes": 12345,
--     "storagePath": "<sessionId>/<attId>__<filename>",  -- relative tới root
--     "contentText": "..." | null,    -- chỉ cho file text-extractable
--     "pageCount": 5 | null,          -- PDF only
--     "isBinaryUnsupported": false
--   }

ALTER TABLE skill_chat_message
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE project_chat_message
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN skill_chat_message.attachments IS
  'Array of attachment objects (image/file) đính kèm message này — ad-hoc per message.';
COMMENT ON COLUMN project_chat_message.attachments IS
  'Array of attachment objects (image/file) đính kèm message này — ad-hoc, khác với project_file (persistent knowledge).';
