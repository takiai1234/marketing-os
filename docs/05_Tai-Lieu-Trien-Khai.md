# Tài Liệu Triển Khai Hệ Thống — Marketing OS

> **Phiên bản:** 1.0 | **Cập nhật:** 2026-07-22  
> **Domain:** mkt.taki.vn | **Môi trường:** Coolify / Docker / PostgreSQL

---

## Mục Lục

1. [Yêu Cầu Hệ Thống](#1-yêu-cầu-hệ-thống)
2. [Tổng Quan Kiến Trúc](#2-tổng-quan-kiến-trúc)
3. [Chuẩn Bị Môi Trường](#3-chuẩn-bị-môi-trường)
4. [Cấu Hình Biến Môi Trường](#4-cấu-hình-biến-môi-trường)
5. [Triển Khai Với Coolify](#5-triển-khai-với-coolify)
6. [CI/CD GitHub Actions](#6-cicd-github-actions)
7. [Cấu Hình Facebook App](#7-cấu-hình-facebook-app)
8. [Cấu Hình Telegram Bot](#8-cấu-hình-telegram-bot)
9. [Quản Lý Database & Migration](#9-quản-lý-database--migration)
10. [Backup & Phục Hồi](#10-backup--phục-hồi)
11. [Monitoring & Logging](#11-monitoring--logging)
12. [Xử Lý Sự Cố Thường Gặp](#12-xử-lý-sự-cố-thường-gặp)
13. [Checklist Bàn Giao](#13-checklist-bàn-giao)

---

## 1. Yêu Cầu Hệ Thống

### 1.1 Phần Cứng Tối Thiểu (VPS)

| Thành phần | Tối thiểu | Khuyến nghị |
|-----------|-----------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB SSD | 50 GB SSD |
| Bandwidth | 100 Mbps | 500 Mbps |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

> **Lưu ý:** Coolify yêu cầu thêm ~1 GB RAM để tự quản lý container. Cộng tổng thực tế cần ít nhất 3–4 GB RAM.

### 1.2 Phần Mềm Cần Cài Trên VPS

| Phần mềm | Phiên bản | Ghi chú |
|----------|-----------|---------|
| Docker | 24.x+ | Bắt buộc |
| Docker Compose | v2.x | Đi kèm Docker |
| Coolify | 4.x | Self-hosted PaaS |
| PostgreSQL | 14+ | Trong Docker hoặc managed |
| Node.js | 20+ | Chỉ cần khi build local |
| Nginx / Traefik | Latest | Coolify tự cấu hình reverse proxy |

### 1.3 Yêu Cầu Mạng

- Domain `mkt.taki.vn` đã trỏ A record về IP của VPS.
- Cổng **80** và **443** mở cho Traefik (Coolify).
- Cổng **22** mở cho SSH quản trị.
- SSL/TLS: Coolify tự cấp Let's Encrypt.

---

## 2. Tổng Quan Kiến Trúc

```
GitHub (main branch)
        │
        │  push event
        ▼
GitHub Actions CI
  → Build Docker image
  → Push to registry (GHCR)
  → Trigger Coolify webhook
        │
        ▼
Coolify (VPS)
  → Pull image mới
  → Deploy container app (Next.js standalone)
  → Reverse proxy: Traefik → mkt.taki.vn (HTTPS)
        │
        ├── PostgreSQL container (hoặc managed DB)
        └── Volume: /app/storage (skills, projects files)
```

---

## 3. Chuẩn Bị Môi Trường

### 3.1 Cài Đặt Coolify Trên VPS

```bash
# SSH vào VPS
ssh root@<VPS_IP>

# Cài Coolify (one-line installer chính thức)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Sau khi cài xong, truy cập `http://<VPS_IP>:8000` để hoàn tất cài đặt Coolify UI.

### 3.2 Tạo Database PostgreSQL

**Cách 1 — Dùng Docker trong Coolify:**

1. Vào Coolify → **Databases** → **New Database** → chọn **PostgreSQL 16**.
2. Điền thông tin:
   - Database name: `marketing_os`
   - Username: `mktuser`
   - Password: tạo mật khẩu mạnh (≥24 ký tự)
3. Lưu lại connection string dạng:  
   `postgresql://mktuser:<password>@<host>:5432/marketing_os`

**Cách 2 — Docker Compose thủ công:**

```yaml
# docker-compose.db.yml
version: '3.8'
services:
  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_DB: marketing_os
      POSTGRES_USER: mktuser
      POSTGRES_PASSWORD: <password_manh>
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  pgdata:
```

```bash
docker compose -f docker-compose.db.yml up -d
```

### 3.3 Khởi Tạo Database Extensions

Kết nối vào PostgreSQL và chạy:

```sql
-- Kết nối tới DB mới tạo
\c marketing_os

-- Bật extensions bắt buộc
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Kiểm tra
SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'uuid-ossp');
```

---

## 4. Cấu Hình Biến Môi Trường

### 4.1 Biến Bắt Buộc

| Biến | Ví dụ | Mô tả |
|------|-------|-------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/marketing_os` | Connection string PostgreSQL |
| `SESSION_PASSWORD` | chuỗi ngẫu nhiên ≥32 ký tự | Mã hóa session cookie (iron-session) |
| `ENCRYPTION_KEY` | hex 64 ký tự (32 byte) | Khóa mã hóa dữ liệu nhạy cảm qua pgcrypto |
| `ADMIN_EMAIL` | `admin@company.com` | Email tài khoản admin đầu tiên |
| `NODE_ENV` | `production` | Chế độ chạy Node.js |
| `APP_URL` | `https://mkt.taki.vn` | URL công khai của app (server-side) |
| `NEXT_PUBLIC_APP_URL` | `https://mkt.taki.vn` | URL công khai (client-side Next.js) |

**Tạo giá trị ngẫu nhiên:**

```bash
# Tạo SESSION_PASSWORD (32+ ký tự)
openssl rand -base64 32

# Tạo ENCRYPTION_KEY (hex 32-byte = 64 ký tự hex)
openssl rand -hex 32

# Tạo CRON_TRIGGER_TOKEN
openssl rand -hex 32
```

### 4.2 Biến Facebook (nếu sử dụng tích hợp Facebook)

| Biến | Mô tả |
|------|-------|
| `FB_APP_ID` | App ID từ Meta Developer Console |
| `FB_APP_SECRET` | App Secret từ Meta Developer Console |
| `FB_REDIRECT_URI` | `https://mkt.taki.vn/api/auth/fb/callback` |

### 4.3 Biến Tùy Chọn (cấu hình trong Admin UI hoặc env)

| Biến | Mô tả |
|------|-------|
| `OPENROUTER_API_KEY` | API key cho AI (OpenRouter) |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram |
| `TELEGRAM_REPORT_CHAT_ID` | Chat ID nhận báo cáo Telegram |
| `LADIPAGE_WEBHOOK_URL` | URL webhook từ LadiPage |
| `BUNDLE_API_KEY` | API key tích hợp Bundle |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON credentials Google Service Account |
| `APIFY_API_TOKEN` | Token Apify scraper |
| `KIEAI_API_KEY` | API key KieAI |
| `LARK_WEBHOOK_URL` | Webhook Lark/Feishu |
| `MCP_BEARER_TOKENS_JSON` | JSON cấu hình bearer tokens cho MCP |
| `CRON_TRIGGER_TOKEN` | Token xác thực khi trigger cron thủ công |
| `SKILL_STORAGE_PATH` | `/app/storage/skills` — đường dẫn lưu skill files |

### 4.4 Tạo Tài Khoản Admin Đầu Tiên

**Bước 1:** Tạo password hash:

```bash
# Chạy lệnh này (thay 'matkhau123' bằng mật khẩu thực)
node -e "const b=require('bcryptjs'); b.hash('matkhau123', 3).then(h=>console.log(h))"
```

**Bước 2:** INSERT vào database:

```sql
INSERT INTO team_member (id, email, name, role, password_hash)
VALUES (
  gen_random_uuid(),
  'admin@company.com',
  'Admin',
  'admin',
  '$2a$03$...<hash-từ-bước-1>...'
);
```

> **Quan trọng:** Không dùng bcrypt cost factor quá cao (≥10) trong production vì tạo hash chậm. Cost=3 chỉ dùng để tạo hash một lần, không ảnh hưởng tới bảo mật runtime (bcrypt verify vẫn an toàn).

---

## 5. Triển Khai Với Coolify

### 5.1 Kết Nối GitHub Repository

1. Vào Coolify → **Sources** → **Add** → chọn **GitHub App**.
2. Authorize Coolify truy cập GitHub account / organization.
3. Chọn repository `marketing-os` (private).

### 5.2 Tạo Application Mới

1. Vào **Projects** → **New Resource** → **Application**.
2. Chọn source: repository GitHub đã kết nối.
3. Branch: `main`.
4. Build Pack: **Dockerfile** (hoặc **Nixpacks** nếu dùng auto-detect).
5. Port: `3000`.

### 5.3 Cấu Hình Domain

1. Tab **Network** → **Domains** → thêm `mkt.taki.vn`.
2. Bật **HTTPS** — Coolify tự cấp Let's Encrypt.
3. Force redirect HTTP → HTTPS: bật.

### 5.4 Cấu Hình Environment Variables

1. Tab **Environment** → thêm từng biến từ mục 4.
2. Đánh dấu các biến nhạy cảm là **Secret** (ẩn trong UI).

### 5.5 Cấu Hình Volume (Bind Mount)

1. Tab **Storages** → **Add Volume**.
2. Source (host): `/opt/coolify/storage/marketing-os`
3. Destination (container): `/app/storage`
4. Type: **Bind Mount**

> Volume này lưu skills, project files — **không được mất khi redeploy**.

### 5.6 Health Check

1. Tab **Health Check** → bật.
2. Path: `/api/auth/login`
3. Method: `GET`
4. Expected status: `200`
5. Interval: `30s`, Timeout: `10s`, Retries: `3`

### 5.7 Deploy Lần Đầu

```bash
# Trong Coolify UI: bấm "Deploy" hoặc dùng webhook
# Hoặc trigger qua API:
curl -X POST "https://<coolify-domain>/api/v1/deploy" \
  -H "Authorization: Bearer <COOLIFY_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"uuid": "<app-uuid>"}'
```

### 5.8 Chạy Migration Sau Deploy

Sau lần deploy đầu, chạy migration trong container:

```bash
# Vào Coolify → Application → Terminal (hoặc SSH vào container)
npm run migrate up

# Hoặc qua docker exec:
docker exec -it <container_name> npm run migrate up
```

---

## 6. CI/CD GitHub Actions

### 6.1 Cấu Hình Secrets Trên GitHub

Vào **GitHub repo → Settings → Secrets and variables → Actions** → thêm:

| Secret | Giá trị |
|--------|---------|
| `COOLIFY_WEBHOOK` | URL webhook từ Coolify (tab Webhooks) |
| `COOLIFY_TOKEN` | API token Coolify (tạo tại Settings → API) |

### 6.2 Workflow File

Tạo file `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Coolify

on:
  push:
    branches:
      - main

jobs:
  deploy:
    name: Trigger Coolify Deploy
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Trigger Coolify webhook
        run: |
          curl --silent --show-error --fail \
            -X GET "${{ secrets.COOLIFY_WEBHOOK }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}"

      - name: Confirm deploy triggered
        run: echo "Deploy triggered successfully on $(date)"
```

> **Lưu ý:** Coolify tự build Docker image từ Dockerfile trong repository khi nhận webhook. Không cần push image lên registry riêng trừ khi muốn dùng GHCR.

### 6.3 Luồng CI/CD Hoàn Chỉnh

```
Developer push to main
        ↓
GitHub Actions chạy workflow
        ↓
Gọi Coolify webhook
        ↓
Coolify clone repo → build Docker image
        ↓
Stop container cũ → Start container mới
        ↓
Health check pass → Traffic chuyển sang container mới
        ↓
Coolify gửi thông báo (Slack/Email nếu cấu hình)
```

---

## 7. Cấu Hình Facebook App

### 7.1 Tạo Facebook App

1. Truy cập [developers.facebook.com](https://developers.facebook.com).
2. **My Apps** → **Create App** → chọn loại **Business**.
3. Điền App Name: `Marketing OS - Taki` (hoặc tên phù hợp).
4. Lưu lại **App ID** và **App Secret** (tab Settings → Basic).

### 7.2 Thêm Products

Trong dashboard App, thêm 2 products:

1. **Facebook Login** → Settings:
   - Valid OAuth Redirect URIs: `https://mkt.taki.vn/api/auth/fb/callback`
   - Bật: **Client OAuth Login**, **Web OAuth Login**

2. **Pages API** (đã có sẵn với Business app)

### 7.3 Cấu Hình Permissions

Vào **App Review → Permissions and Features**, yêu cầu các quyền:

| Permission | Mục đích |
|-----------|---------|
| `pages_show_list` | Liệt kê danh sách Pages |
| `pages_read_engagement` | Đọc engagement metrics |
| `pages_read_user_content` | Đọc content trên Page |
| `read_insights` | Đọc Page Insights (analytics) |
| `ads_read` | Đọc dữ liệu quảng cáo |
| `business_management` | Quản lý Business Manager |

> Trong môi trường **development**, chỉ cần tài khoản admin của App có quyền. Để dùng với Pages của người khác cần submit App Review.

### 7.4 Cấu Hình Env Vars

Thêm vào Coolify hoặc `.env`:

```
FB_APP_ID=<app_id>
FB_APP_SECRET=<app_secret>
FB_REDIRECT_URI=https://mkt.taki.vn/api/auth/fb/callback
```

### 7.5 Kết Nối Channel Trong App

1. Vào Marketing OS → **Channels** → **Add Channel**.
2. Chọn **Facebook Page** → Click **Connect with Facebook**.
3. Đăng nhập Facebook → Authorize App → Chọn Page cần kết nối.
4. Token được lưu mã hóa trong database.

---

## 8. Cấu Hình Telegram Bot

### 8.1 Tạo Bot Qua BotFather

```
1. Mở Telegram → tìm @BotFather → /start
2. Gõ: /newbot
3. Nhập tên bot: Marketing OS Bot
4. Nhập username: marketing_os_taki_bot (phải kết thúc bằng "bot")
5. BotFather trả về Token: 1234567890:ABCdef...
   → Lưu lại TOKEN này
```

### 8.2 Thêm Bot Vào Group Nhận Báo Cáo

```
1. Tạo Group Telegram (hoặc dùng group có sẵn)
2. Thêm bot vào group: Add Member → tìm @marketing_os_taki_bot
3. Set bot làm Admin trong group (để bot có thể gửi tin)
4. Lấy Chat ID của group:
   - Gõ tin nhắn bất kỳ trong group
   - Truy cập: https://api.telegram.org/bot<TOKEN>/getUpdates
   - Tìm "chat": {"id": -100xxxxxxxxxx} → đây là Chat ID
```

### 8.3 Cấu Hình Trong App

**Cách 1 — Qua Admin UI (khuyến nghị):**

1. Vào Marketing OS → **Admin** → **Settings** → **Telegram**.
2. Điền **Bot Token** và **Report Chat ID**.
3. Click **Đăng ký Q&A (Webhook)** để register webhook URL.

**Cách 2 — Qua Environment Variables:**

```
TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
TELEGRAM_REPORT_CHAT_ID=-100123456789
```

### 8.4 Kiểm Tra Webhook

```bash
# Kiểm tra webhook đã đăng ký chưa
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# Kết quả mong đợi:
# "url": "https://mkt.taki.vn/api/telegram/webhook"
# "pending_update_count": 0
```

> **Lưu ý proxy:** Nếu VPS dùng Nginx/Cloudflare, đảm bảo path `/api/telegram/webhook` **không bị block** hoặc cache.

---

## 9. Quản Lý Database & Migration

### 9.1 Kiểm Tra Trạng Thái Migration

```bash
# Trong container hoặc môi trường local có DATABASE_URL
npm run migrate status
```

### 9.2 Chạy Migration Mới

```bash
# Chạy tất cả migration còn pending
npm run migrate up

# Rollback 1 migration gần nhất
npm run migrate down

# Rollback về migration cụ thể
npm run migrate down --count 3
```

### 9.3 Quy Trình Khi Có Schema Thay Đổi

```
1. Developer tạo migration file mới trong /migrations
2. Test local: npm run migrate up
3. Commit + push → CI/CD deploy lên production
4. Sau deploy: chạy npm run migrate up trong container production
   (hoặc tích hợp vào entrypoint Dockerfile)
```

### 9.4 Tích Hợp Migration Vào Startup (Tùy Chọn)

Trong `Dockerfile` hoặc entrypoint script:

```bash
#!/bin/sh
# entrypoint.sh
echo "Running database migrations..."
npm run migrate up

echo "Starting application..."
exec node server.js
```

---

## 10. Backup & Phục Hồi

### 10.1 Backup Database

**Tự động qua Coolify:**

1. Vào Coolify → Database → **Backups** → bật lịch backup.
2. Cấu hình: Daily backup lúc 02:00 AM, giữ 7 bản.
3. Backup lưu tại `/opt/coolify/backups/` trên VPS.

**Thủ công (khi cần):**

```bash
# Dump toàn bộ database
docker exec <postgres_container> pg_dump \
  -U mktuser marketing_os \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Nén backup
gzip backup_*.sql
```

### 10.2 Backup Files (Volume /app/storage)

```bash
# Backup toàn bộ thư mục storage
tar -czf storage_backup_$(date +%Y%m%d).tar.gz \
  /opt/coolify/storage/marketing-os/

# Sync lên S3 (nếu dùng)
aws s3 cp storage_backup_*.tar.gz s3://backup-bucket/marketing-os/
```

### 10.3 Phục Hồi Database

```bash
# Restore từ SQL dump
docker exec -i <postgres_container> psql \
  -U mktuser marketing_os \
  < backup_20260101_020000.sql

# Hoặc từ file nén
gunzip -c backup_20260101_020000.sql.gz | \
  docker exec -i <postgres_container> psql -U mktuser marketing_os
```

### 10.4 Phục Hồi Files

```bash
# Khôi phục storage volume
tar -xzf storage_backup_20260101.tar.gz \
  -C /opt/coolify/storage/marketing-os/
```

### 10.5 Lịch Backup Đề Xuất

| Loại | Tần suất | Giữ lại | Nơi lưu |
|------|----------|---------|---------|
| Database full dump | Hàng ngày 02:00 AM | 7 ngày | VPS + S3 |
| Files (/app/storage) | Hàng tuần | 4 tuần | VPS + S3 |
| Env variables | Mỗi khi thay đổi | Vĩnh viễn | Coolify secrets |

---

## 11. Monitoring & Logging

### 11.1 Xem Log Container Realtime

```bash
# Qua Coolify UI: Application → Logs (tab)

# Qua CLI:
docker logs -f <container_name> --tail 100
```

### 11.2 Trang Cron Logs Trong App

Truy cập: `https://mkt.taki.vn/cron-logs`

- Xem lịch sử tất cả cron jobs đã chạy
- Filter theo job name, trạng thái (success/fail)
- Xem chi tiết error message khi sync thất bại

### 11.3 Trigger Cron Job Thủ Công

```bash
# Trigger job page_insights (cần admin session hoặc token)
curl -X POST "https://mkt.taki.vn/api/admin/run-job?job=page_insights" \
  -H "Authorization: Bearer <CRON_TRIGGER_TOKEN>"

# Các job có thể trigger:
# - page_insights  : đồng bộ Facebook Page Insights
# - ads_ingestion  : đồng bộ dữ liệu quảng cáo
```

### 11.4 Cấu Hình Alert

Hệ thống tự tạo alert khi:
- **Token Facebook hết hạn** → hiển thị cảnh báo trong Channels
- **Sync lỗi liên tục** → log vào cron-logs, gửi notification (nếu Telegram cấu hình)
- **Database connection fail** → container crash → Coolify restart + thông báo

### 11.5 Uptime Monitoring (Khuyến Nghị)

Dùng dịch vụ bên ngoài để ping health check định kỳ:

```
URL: https://mkt.taki.vn/api/auth/login
Method: GET
Interval: 5 phút
Alert: Email/Telegram khi downtime > 2 phút
```

Gợi ý dịch vụ miễn phí: UptimeRobot, Better Uptime, Freshping.

---

## 12. Xử Lý Sự Cố Thường Gặp

### 12.1 Token Facebook Hết Hạn

**Triệu chứng:** Cron sync page_insights fail, alert "Token expired" trong app.

**Giải quyết:**

```
1. Vào Marketing OS → Channels
2. Tìm channel bị lỗi (badge đỏ)
3. Click vào channel → "Refresh Token"
4. Đăng nhập lại Facebook nếu cần
5. Kiểm tra /cron-logs để confirm sync chạy lại thành công
```

### 12.2 Cron Job Không Chạy

**Triệu chứng:** /cron-logs không có entry mới trong >24h.

**Kiểm tra:**

```bash
# Xem log startup container để check node-cron init
docker logs <container_name> | grep -i "cron"

# Kết quả mong đợi:
# [CRON] Initialized: page_insights - every day at 06:00
# [CRON] Initialized: ads_ingestion - every 6 hours

# Nếu không thấy → container có thể restart loop
docker ps -a | grep marketing-os
```

### 12.3 Telegram Webhook Không Nhận Tin

**Triệu chứng:** Gửi tin nhắn vào Telegram bot nhưng app không phản hồi.

**Kiểm tra:**

```bash
# 1. Kiểm tra webhook đã đăng ký đúng URL chưa
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# 2. Đảm bảo /api/telegram/webhook không bị chặn bởi proxy/firewall
curl -I https://mkt.taki.vn/api/telegram/webhook

# 3. Nếu dùng Cloudflare: thêm rule bypass cache cho path này
# 4. Đăng ký lại webhook qua Admin UI → Settings → Telegram
```

### 12.4 Database Migration Fail

**Triệu chứng:** App crash sau deploy, log có lỗi migration.

```bash
# Kiểm tra trạng thái migration
npm run migrate status

# Xem migration nào đang lỗi
npm run migrate up 2>&1 | tail -50

# Kết nối thẳng vào DB kiểm tra
docker exec -it <postgres_container> psql -U mktuser marketing_os
\dt  -- liệt kê tables
SELECT * FROM pgmigrations ORDER BY run_on DESC LIMIT 10;
```

### 12.5 Container Crash / Không Start

**Triệu chứng:** Coolify hiển thị container "Stopped" hoặc liên tục restart.

**Quy trình debug:**

```bash
# 1. Xem log crash
docker logs <container_name> --tail 200

# Lỗi thường gặp:
# "connect ECONNREFUSED" → DATABASE_URL sai host/port
# "password authentication failed" → DATABASE_URL sai credentials
# "Cannot find module" → build thiếu file
# "ENCRYPTION_KEY must be 64 hex chars" → env var sai format

# 2. Kiểm tra env vars trong Coolify UI (không bị thiếu hay sai format)
# 3. Kiểm tra database có accessible từ container không
docker exec <container_name> nc -zv <db_host> 5432
```

### 12.6 App Chạy Nhưng Không Vào Được URL

**Triệu chứng:** Browser báo 502/504 hoặc connection refused.

```bash
# Kiểm tra container đang lắng nghe port 3000
docker exec <container_name> ss -tlnp | grep 3000

# Kiểm tra Traefik routing trong Coolify
# Vào Coolify → Proxy → kiểm tra cấu hình domain mkt.taki.vn

# Kiểm tra SSL certificate
curl -I https://mkt.taki.vn
```

---

## 13. Checklist Bàn Giao

### Hạ Tầng

- [ ] VPS đã cài Coolify, accessible tại `http://<IP>:8000`
- [ ] Domain `mkt.taki.vn` đã trỏ A record về IP VPS
- [ ] SSL/HTTPS hoạt động (Let's Encrypt auto-renew)
- [ ] PostgreSQL container chạy ổn định, backup tự động bật
- [ ] Volume `/app/storage` đã mount, dữ liệu được giữ qua redeploy

### Application

- [ ] App deploy thành công, health check pass
- [ ] URL `https://mkt.taki.vn` accessible, redirect HTTPS
- [ ] Tài khoản admin đầu tiên đăng nhập được
- [ ] Database migrations đã chạy đầy đủ (`npm run migrate status`)
- [ ] Trang `/cron-logs` hiển thị lịch sử cron

### Integrations

- [ ] Facebook App đã cấu hình, redirect URI đúng
- [ ] Kết nối ít nhất 1 Facebook Page thành công
- [ ] Telegram Bot đã tạo, webhook đã đăng ký
- [ ] Tin nhắn Telegram bot phản hồi đúng
- [ ] Cron sync chạy và có data trong cron-logs

### CI/CD

- [ ] GitHub Actions workflow file tồn tại tại `.github/workflows/deploy.yml`
- [ ] Secrets `COOLIFY_WEBHOOK` và `COOLIFY_TOKEN` đã set trong GitHub
- [ ] Test: push commit nhỏ lên main → Coolify tự deploy thành công

### Security

- [ ] `SESSION_PASSWORD` là chuỗi ngẫu nhiên ≥32 ký tự, **không trong code**
- [ ] `ENCRYPTION_KEY` là hex 64 ký tự, **không trong code**
- [ ] `FB_APP_SECRET` lưu trong Coolify secrets, **không trong repo**
- [ ] Không có file `.env` với giá trị thật trong repository
- [ ] Admin password là mật khẩu mạnh, đã thay default

### Tài Liệu Bàn Giao

- [ ] File này (`05_Tai-Lieu-Trien-Khai.md`) đã được review
- [ ] Coolify credentials đã bàn giao an toàn
- [ ] GitHub repo access đã được cấp cho team
- [ ] Số điện thoại / contact hỗ trợ kỹ thuật đã có

---

## Phụ Lục: Docker Compose Hoàn Chỉnh (Development / Staging)

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    image: ghcr.io/<your-org>/marketing-os:latest
    # Hoặc build local:
    # build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://mktuser:secret@db:5432/marketing_os
      SESSION_PASSWORD: ${SESSION_PASSWORD}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      APP_URL: ${APP_URL}
      NEXT_PUBLIC_APP_URL: ${APP_URL}
      FB_APP_ID: ${FB_APP_ID}
      FB_APP_SECRET: ${FB_APP_SECRET}
      FB_REDIRECT_URI: ${APP_URL}/api/auth/fb/callback
    volumes:
      - ./storage:/app/storage
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: marketing_os
      POSTGRES_USER: mktuser
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mktuser -d marketing_os"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

---

*Tài liệu này được cập nhật lần cuối: 2026-07-22. Mọi thay đổi về cấu hình hệ thống cần cập nhật tài liệu này.*
