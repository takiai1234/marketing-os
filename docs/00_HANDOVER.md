# Tài liệu Bàn giao — Marketing OS

> **Phiên bản bàn giao:** Tháng 7/2026  
> **Hình thức:** Bàn giao Source Code + Tài liệu — Khách hàng tự dựng môi trường mới

---

## 1. Nội dung bàn giao

### 1.1 Source Code
| Thành phần | Mô tả |
|-----------|-------|
| GitHub repository | Toàn bộ source code Next.js + migrations + CI/CD config |
| Branch chính | `main` — đây là branch production |
| Tổng số commits | Xem `git log --oneline` |

### 1.2 Tài liệu kỹ thuật (thư mục này)
| File | Nội dung |
|------|---------|
| `01_Dac-Ta-He-Thong.md` | Đặc tả yêu cầu hệ thống (SRS — chuẩn IEEE 830) |
| `02_Thiet-Ke-He-Thong.md` | Thiết kế kiến trúc (SAD — luồng dữ liệu, ADR, bảo mật) |
| `03_Thiet-Ke-CSDL.md` | Thiết kế cơ sở dữ liệu (30 bảng, ERD, index, mã hoá) |
| `04_Mo-Ta-UseCase.md` | Mô tả 28 Use Case đầy đủ |
| `05_Tai-Lieu-Trien-Khai.md` | Hướng dẫn triển khai step-by-step |

---

## 2. Yêu cầu môi trường để vận hành

| Thành phần | Phiên bản tối thiểu | Ghi chú |
|-----------|-------------------|---------|
| Node.js | 20 LTS | Hoặc chạy Docker |
| PostgreSQL | 14+ | Cần extension pgcrypto, uuid-ossp |
| RAM | 2 GB | 4 GB khuyến nghị |
| Storage | 20 GB | Cho DB + file uploads |
| Docker | 24+ | Khuyến nghị dùng Coolify |

---

## 3. Các tài khoản / dịch vụ bên ngoài cần tự tạo

Khách hàng cần đăng ký **riêng** các dịch vụ sau. Không dùng chung credentials với bên bàn giao.

### 3.1 Bắt buộc (hệ thống không chạy nếu thiếu)
| Dịch vụ | Cần lấy gì | Hướng dẫn |
|---------|-----------|----------|
| **PostgreSQL** | `DATABASE_URL` | Dùng Supabase, Neon, Railway, hoặc tự host |
| **Hosting** | VPS + Docker | Khuyến nghị dùng Coolify (xem tài liệu 05) |

### 3.2 Tùy chọn — tuỳ tính năng cần dùng

| Dịch vụ | Tính năng | Cần lấy gì | Đăng ký tại |
|---------|-----------|-----------|------------|
| **Meta (Facebook) App** | Sync kênh FB, Ads | `FB_APP_ID`, `FB_APP_SECRET` | developers.facebook.com |
| **Bundle.social** | Sync TikTok, YouTube, Instagram, LinkedIn... | `BUNDLE_API_KEY` | bundle.social |
| **OpenRouter** | Chat AI (Claude, GPT, Gemini, Grok) | `OPENROUTER_API_KEY` | openrouter.ai |
| **Google Cloud** | Landing page GA4, Google Sheets | Service Account JSON | console.cloud.google.com |
| **Telegram** | Báo cáo tự động + Q&A bot | Bot Token, Chat ID, Bot Username | @BotFather trên Telegram |
| **Apify** | Thu thập tin tức tự động | `APIFY_API_TOKEN` | apify.com |
| **Lark/Feishu** | Gửi báo cáo lên Lark | Webhook URL | open.feishu.cn |
| **Ladipage** | Đồng bộ leads landing page | Webhook URL + API Key | ladipage.vn |
| **Kieai** | LLM tiếng Việt (thay thế OpenRouter) | `KIEAI_API_KEY` | kieai.io |

### 3.3 Lưu ý Facebook App
Khi tạo Facebook App mới cần:
1. Thêm product: **Facebook Login**, **Pages API**
2. Thêm permissions: `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `read_insights`, `ads_read`, `business_management`
3. Điền **Valid OAuth Redirect URI**: `https://<domain-của-bạn>/api/auth/fb/callback`
4. Submit để review (Meta cần duyệt permissions nâng cao — thường 2–5 ngày làm việc)

---

## 4. Biến môi trường cần cấu hình

Xem file `app/.env.example` để biết danh sách đầy đủ. Dưới đây là các biến **bắt buộc** trước khi khởi động:

```bash
# === BẮT BUỘC ===
DATABASE_URL=postgresql://user:pass@host:5432/marketing_os
NODE_ENV=production
APP_URL=https://your-domain.com
NEXT_PUBLIC_APP_URL=https://your-domain.com

# Tạo bằng: openssl rand -base64 32
SESSION_PASSWORD=<chuỗi ngẫu nhiên tối thiểu 32 ký tự>

# Tạo bằng: openssl rand -hex 32
ENCRYPTION_KEY=<hex 64 ký tự>

# Email đăng nhập của admin đầu tiên
ADMIN_EMAIL=admin@your-company.com
```

### Cách tạo tài khoản admin đầu tiên

```bash
# Bước 1: Tạo password hash
node -e "const b=require('bcryptjs'); b.hash('MatKhauCuaBan',3).then(h=>console.log(h))"

# Bước 2: INSERT vào DB (sau khi chạy migrations)
psql $DATABASE_URL -c "
INSERT INTO team_member (id, email, name, role, password_hash)
VALUES (gen_random_uuid(), 'admin@your-company.com', 'Admin', 'admin', '<hash ở bước 1>');
"
```

---

## 5. Các bước triển khai tóm tắt

```
1. Clone repository
2. Cài PostgreSQL → tạo database → bật extension pgcrypto + uuid-ossp
3. Copy .env.example → .env.local → điền biến bắt buộc
4. npm install
5. npm run migrate up          ← chạy 55 migrations
6. Tạo tài khoản admin (xem mục 4)
7. npm run build && npm start  ← hoặc Docker
8. Đăng nhập → Settings → điền API keys còn lại qua Admin UI
```

Chi tiết từng bước: xem **`05_Tai-Lieu-Trien-Khai.md`**

---

## 6. Tính năng cần cấu hình trong Admin UI sau khi deploy

Sau khi hệ thống chạy, vào **Settings > Integrations** để cấu hình:

- [ ] OpenRouter API Key (cho tính năng Chat AI)
- [ ] Telegram Bot Token + Chat ID + đăng ký webhook Q&A
- [ ] Google OAuth / Service Account (cho GA4 + Sheets)
- [ ] Apify Token (cho tin tức tự động)
- [ ] Lark Webhook URL (nếu dùng)

---

## 7. Lưu ý quan trọng sau bàn giao

### Bảo mật
- `SESSION_PASSWORD` và `ENCRYPTION_KEY` phải được giữ **bí mật tuyệt đối** — nếu lộ, toàn bộ token Facebook/API keys trong DB bị compromise
- Không commit `.env.local` lên Git
- Đổi mật khẩu admin ngay sau khi đăng nhập lần đầu

### Facebook API
- Access token Facebook hết hạn sau **60 ngày** — cần reconnect định kỳ hoặc dùng System User token (không hết hạn)
- Nếu Facebook App chưa được verify, API sẽ bị giới hạn rate và permissions

### Cron Jobs
- 13 cron job chạy **in-process** (trong container Node.js) — không cần crontab OS
- Nếu container restart, cron tự khởi động lại khi app start
- Xem lịch sử cron tại: `/cron-logs` trong app

### Dữ liệu
- Hệ thống **không kèm data mẫu** — sau khi deploy sẽ trống, cần kết nối kênh và chờ cron đồng bộ lần đầu (hoặc bấm "Đồng bộ ngay")
- Múi giờ toàn bộ hệ thống: **Asia/Ho_Chi_Minh (UTC+7)**

---

## 8. Hỗ trợ kỹ thuật

Nếu gặp vấn đề trong quá trình triển khai, tham chiếu theo thứ tự:

1. `05_Tai-Lieu-Trien-Khai.md` → phần **Troubleshooting**
2. File `app/.env.example` — mỗi biến đều có giải thích chi tiết
3. Log container (Coolify → Application → Logs)
4. Trang `/cron-logs` trong app để xem trạng thái sync

---

*Tài liệu này được tạo tự động từ source code. Phiên bản: tháng 7/2026.*
