# Marketing OS — TAKI Group

Nền tảng vận hành marketing nội bộ. Quản lý đa kênh social (Facebook, TikTok, YouTube,
Instagram, LinkedIn, Twitter... qua Facebook API trực tiếp + **Bundle.social**),
content briefs, bài đăng & metrics, doanh thu, conversion từ landing page (Ladipage/n8n),
tin tức, thư viện skill, và quản lý team. Có MCP server để AI agent (Claude Desktop/Code,
Zapier, n8n) truy vấn dữ liệu read-only.

> Đây là **monorepo**: code app + hạ tầng (Docker, Nginx) nằm chung 1 repo.

---

## Tech Stack

| Lớp | Công nghệ |
|-----|-----------|
| Frontend + Backend | Next.js 16 (App Router) + React 19 + TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Database | PostgreSQL 16 (extension `pgcrypto`) |
| Auth | iron-session (cookie mã hoá) |
| Migrations | node-pg-migrate (SQL files) |
| Charts | Recharts |
| Validation | Zod 4 |
| Hạ tầng | Docker Compose + Nginx reverse proxy + Certbot SSL |
| Multi-platform | Facebook Graph API (trực tiếp) + Bundle.social (TikTok, YouTube, IG, LinkedIn, Twitter, Threads, Pinterest, Reddit, Mastodon, Bluesky, Zalo) |
| Cron | node-cron (8 job nền, đăng ký trong `instrumentation.ts`) |
| AI integration | MCP Server (Model Context Protocol) |

---

## Tính năng chính (các trang sau đăng nhập)

| Trang | Mô tả |
|-------|-------|
| `dashboard` | KPI hero, biểu đồ xu hướng, bảng kênh, top performers, feed cảnh báo |
| `channels` | Kết nối/quản lý social account (FB trực tiếp + Bundle.social) |
| `briefs` | Content brief: tạo, theo dõi status, activity log, draft content |
| `revenue` | Nhập & theo dõi doanh thu thủ công |
| `library` | Thư viện nội dung (có full-text search) |
| `news` | Ingest & xem tin tức |
| `skills` | Thư viện skill — upload file zip, download, quản lý |
| `team` | Quản lý thành viên (role, reset password) |
| `cron-logs` | Theo dõi log các job nền |

---

## Cấu trúc thư mục

```
marketing/
├── app/                      # Next.js app — code chính
│   ├── src/                  # app/ (routes), components/, lib/, mcp/
│   ├── migrations/           # SQL migrations 001–022
│   ├── scripts/              # migrate.cjs, seed, hash-password, mcp-stdio
│   ├── Dockerfile            # Build image production (standalone)
│   └── .env.example          # Template env cho DEV
├── db/init/                  # Script init Postgres (chạy 1 lần khi tạo container)
├── nginx/                    # nginx.conf + site config (reverse proxy → app:3000)
├── scripts/                  # backup/restore Postgres, setup-vps.md (run book)
├── docs/                     # Tài liệu dự án (journals, ...)
├── docker-compose.yml        # Stack PRODUCTION (postgres + app + nginx)
├── docker-compose.dev.yml    # Chỉ Postgres cho DEV (port 5434)
└── .env.production.example   # Template env cho PRODUCTION
```

---

## Chạy Local (Development)

### Yêu cầu
- **Node.js 20+**
- **Docker** + **Docker Compose**
- **Git**

### Các bước

**1. Clone & cài dependencies**
```bash
git clone https://github.com/takiai1234/marketing-os.git
cd marketing-os/app
npm install
```

**2. Khởi động Postgres dev** (chạy từ thư mục gốc repo)
```bash
cd ..
docker compose -f docker-compose.dev.yml up -d
# Postgres lắng nghe tại localhost:5434 (user: marketing / pass: devpass)
```

**3. Tạo file env**
```bash
cd app
cp .env.example .env
```
Tối thiểu cần điền trong `.env`:
- `DATABASE_URL` — đã trỏ sẵn `localhost:5434` (khớp docker-compose.dev.yml)
- `SESSION_PASSWORD` — chuỗi bất kỳ ≥ 32 ký tự (dev)
- `ADMIN_PASSWORD_HASH` — sinh ở bước 4

**4. Sinh hash mật khẩu admin**
```bash
node -e "require('bcryptjs').hash('your-dev-password', 12).then(h => console.log(h))"
```
Copy kết quả → dán vào `ADMIN_PASSWORD_HASH` trong `.env`.

> **Tại sao hash?** App không lưu mật khẩu thô. Đăng nhập so khớp bcrypt hash — an toàn hơn nếu DB bị lộ.

**5. Chạy migrations + seed dữ liệu mẫu**
```bash
npm run db:migrate
npm run db:seed      # tuỳ chọn — tạo dữ liệu demo
```

**6. Khởi động dev server**
```bash
npm run dev
```
Mở http://localhost:3000 → đăng nhập bằng `ADMIN_EMAIL` + mật khẩu vừa hash.

---

## Scripts (chạy trong `app/`)

| Lệnh | Tác dụng |
|------|----------|
| `npm run dev` | Dev server (hot reload) |
| `npm run build` | Build production |
| `npm run start` | Chạy bản đã build |
| `npm run db:migrate` | Chạy migration còn pending |
| `npm run db:rollback` | Rollback 1 migration gần nhất |
| `npm run db:seed` | Seed dữ liệu dev |
| `npm run db:reset` | Drop tất cả → migrate → seed (cẩn thận, mất data) |
| `npm run mcp:stdio` | MCP server cho Claude Desktop/Code |

---

## Database

- **Engine:** PostgreSQL 16 + `pgcrypto` (mã hoá FB access token bằng `pgp_sym_encrypt`)
- **Migrations:** 22 file SQL trong `app/migrations/` (001–022), quản lý bởi node-pg-migrate
- **Dev:** cổng `5434` (xem `docker-compose.dev.yml`)
- **Production:** chỉ trong Docker network nội bộ, **không** expose ra host (bảo mật)

Truy vấn DB dev thủ công:
```bash
docker compose -f docker-compose.dev.yml exec postgres psql -U marketing marketing_os
```

---

## Biến môi trường

| File | Dùng cho | Cách dùng |
|------|----------|-----------|
| `app/.env.example` | Development | `cp app/.env.example app/.env` rồi điền |
| `.env.production.example` | Production | `cp .env.production.example .env.production` rồi điền |

Các biến quan trọng:
- `DATABASE_URL`, `SESSION_PASSWORD`, `ENCRYPTION_KEY` (AES cho FB token)
- `FB_APP_ID`/`FB_APP_SECRET` (Meta Developer Console) — kết nối Facebook trực tiếp
- `BUNDLE_API_BASE_URL`/`BUNDLE_API_KEY` — kết nối Bundle.social (TikTok, IG, YouTube...)
- `LADIPAGE_*` (sync conversion qua n8n webhook)
- `MCP_BEARER_TOKENS_JSON` (token cho MCP server)

> **KHÔNG BAO GIỜ** commit `.env` / `.env.production`. Chúng đã nằm trong `.gitignore`.

---

## Deployment (Production)

Hướng dẫn deploy đầy đủ lên VPS Ubuntu: **[`scripts/setup-vps.md`](scripts/setup-vps.md)**
(Docker + Nginx + Let's Encrypt SSL + cron backup).

Tóm tắt nhanh:
```bash
cp .env.production.example .env.production   # điền đủ giá trị
docker compose build app
docker compose up -d
docker compose logs -f app                   # theo dõi log
```

Cập nhật code mới trên VPS:
```bash
git pull
docker compose build app
docker compose up -d app
```

---

## MCP Server

Marketing OS expose dữ liệu read-only qua Model Context Protocol (10 tools: channels,
posts, analytics). Setup chi tiết: [`app/docs/mcp-server-setup.md`](app/docs/mcp-server-setup.md).

---

## Cron Jobs (job nền)

Đăng ký qua `instrumentation.ts` → `lib/cron/init.ts`. Code tại `app/src/lib/cron/`:

| Job | Nhiệm vụ |
|-----|----------|
| `job-page-insights` | Sync chỉ số page Facebook |
| `job-posts-ingestion` | Sync bài đăng & metrics |
| `job-health-recompute` | Tính lại điểm health của kênh |
| `job-ladipage-sync` | Sync conversion từ Ladipage (23:30 VN) |
| `job-news-ingestion` | Ingest tin tức |
| `job-bundle-connect-poller` | Poll trạng thái kết nối Bundle.social |
| `job-bundle-import` / `-poller` | Import & poll dữ liệu post từ Bundle.social |

> Có thể chạy 1 job thủ công qua API admin: `POST /api/admin/run-job`. Xem trạng thái: `/api/admin/cron-status`.

---

## Lưu ý cho dev mới (Common Pitfalls)

- **Next.js 16 có breaking changes** so với bản cũ. Đọc `app/AGENTS.md` — nhiều API/convention
  khác với kiến thức cũ. Tham khảo `node_modules/next/dist/docs/` khi cần.
- **Port Postgres dev là `5434`**, không phải 5432 (tránh đụng Postgres khác trên máy).
- **App không chạy được nếu thiếu `ADMIN_PASSWORD_HASH`** — đăng nhập sẽ luôn fail.
- **Migrations chạy tự động khi container app start** trên production (`run-migrations.cjs`),
  nhưng ở dev phải chạy tay `npm run db:migrate`.
- **`.secrets/`, `.env*`, `plans/` không được commit** — đã cấu hình trong `.gitignore`.

---

## Quy ước Git

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`
- Branch chính: `main`
- Push: `git push origin main` (remote `origin` đã trỏ tới repo này)
