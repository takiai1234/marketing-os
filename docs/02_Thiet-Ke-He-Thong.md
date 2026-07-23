# Tài liệu Thiết kế Kiến trúc Hệ thống (SAD)
# Marketing OS — System Architecture Document

**Phiên bản:** 1.0  
**Ngày:** 2026-07-22  
**Trạng thái:** Chính thức

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Kiến trúc phân lớp](#2-kiến-trúc-phân-lớp)
3. [Luồng dữ liệu chính](#3-luồng-dữ-liệu-chính)
4. [Thiết kế module từng domain](#4-thiết-kế-module-từng-domain)
5. [Thiết kế bảo mật](#5-thiết-kế-bảo-mật)
6. [Thiết kế tích hợp bên ngoài](#6-thiết-kế-tích-hợp-bên-ngoài)
7. [Thiết kế Cron / Scheduler](#7-thiết-kế-cron--scheduler)
8. [Thiết kế MCP Server](#8-thiết-kế-mcp-server)
9. [Quyết định kiến trúc (ADR)](#9-quyết-định-kiến-trúc-adr)

---

## 1. Tổng quan kiến trúc

Marketing OS là nền tảng quản lý marketing tích hợp, được xây dựng trên kiến trúc **monolith modular** chạy trên Next.js App Router. Hệ thống xử lý đồng bộ dữ liệu từ nhiều nền tảng mạng xã hội, cung cấp dashboard phân tích, hỗ trợ chatbot Telegram, và expose MCP Server cho các AI assistant.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INTERNET / CLIENTS                           │
│                                                                     │
│  Browser (Next.js)   Telegram Bot   Claude Desktop / Cursor IDE    │
└────────┬──────────────────┬─────────────────┬───────────────────────┘
         │                  │                 │
         ▼                  ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     COOLIFY (Docker on VPS)                         │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              Next.js App (Node.js standalone)                  │  │
│  │                                                               │  │
│  │  proxy.ts ──► App Router (RSC + API Routes)                   │  │
│  │                    │                                           │  │
│  │      ┌─────────────┼──────────────────────┐                   │  │
│  │      │             │                      │                   │  │
│  │  Pages (RSC)  API Routes (89)       MCP Server                │  │
│  │      │             │               (HTTP+stdio)               │  │
│  │      └─────────────┴──────────────────────┘                   │  │
│  │                    │                                           │  │
│  │              lib/ (domain modules)                             │  │
│  │      auth │ fb │ google │ bundle │ telegram │ llm              │  │
│  │      cron │ queries │ settings │ ads │ news                   │  │
│  └───────────────────────┬───────────────────────────────────────┘  │
│                          │                                           │
│  ┌───────────────────────▼───────────────────────────────────────┐  │
│  │               PostgreSQL 14+ (Managed)                         │  │
│  │         pgcrypto · uuid-ossp · timezone Asia/HCM              │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Docker Volumes: /app/storage/skills  /app/storage/projects         │
└─────────────────────────────────────────────────────────────────────┘
         │                  │                 │
         ▼                  ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐
│  Facebook    │  │  Bundle      │  │  Google GA4 / Sheets          │
│  Graph API   │  │  Social API  │  │  OpenRouter / Telegram API    │
│  v25.0       │  │  (10 nền     │  │  Apify / Lark / Ladipage      │
│              │  │   tảng)      │  │                              │
└──────────────┘  └──────────────┘  └──────────────────────────────┘
```

### Nguyên tắc kiến trúc

| Nguyên tắc | Cách thực hiện |
|---|---|
| **Single deployment unit** | Monolith Next.js — dễ deploy, không overhead mạng giữa services |
| **Domain isolation** | Mỗi nền tảng (fb, bundle, google) có module riêng trong `lib/` |
| **Security by default** | Tất cả route bị chặn bởi `proxy.ts`, chỉ whitelist explicit |
| **Encryption at rest** | pgcrypto cho tokens; iron-session cho cookie; bcryptjs cho mật khẩu |
| **Async sync** | Bundle import polling, cron in-process, tránh blocking request |

---

## 2. Kiến trúc phân lớp

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER (Next.js App Router)                    │
│                                                             │
│  Server Components (RSC)          Client Components         │
│  ┌───────────────────────┐        ┌───────────────────────┐ │
│  │ dashboard/page.tsx    │        │ ads/AdChart.tsx        │ │
│  │ channels/page.tsx     │        │ chat/ChatPanel.tsx     │ │
│  │ ads/page.tsx          │        │ team/UserForm.tsx      │ │
│  │ ... (12 sections)     │        │ ui/ (shared)           │ │
│  └───────────────────────┘        └───────────────────────┘ │
│                                                             │
│  Middleware: proxy.ts — xác thực session mọi request        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  APPLICATION LAYER (API Routes — /app/api/)                 │
│                                                             │
│  89 route handlers, tất cả runtime: nodejs                  │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ /auth     │ │ /ads     │ │ /channels│ │ /admin/      │  │
│  │ /skills   │ │ /briefs  │ │ /news    │ │  run-job     │  │
│  │ /telegram │ │ /revenue │ │ /projects│ │ /settings    │  │
│  └───────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│                                                             │
│  Xác thực: getIronSession() trên mọi route (trừ whitelist)  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  BUSINESS LOGIC LAYER (lib/)                                │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ lib/fb/  │ │lib/bundle│ │lib/google│ │lib/telegram/ │   │
│  │ fb-api   │ │sync      │ │ga4, sheet│ │bot-handler   │   │
│  │ insights │ │polling   │ │oauth     │ │intent-parser │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ lib/llm/ │ │lib/auth/ │ │lib/cron/ │ │lib/settings/ │   │
│  │ openrouter│ │session  │ │13 jobs   │ │pgcrypto      │   │
│  │ kieai    │ │rate-limit│ │init.ts   │ │encrypt/decrypt│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│                                                             │
│  lib/queries/ — 35 modules truy vấn SQL có type-safe        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  DATA LAYER                                                 │
│                                                             │
│  lib/db.ts — pg Pool, timezone Asia/Ho_Chi_Minh            │
│                                                             │
│  PostgreSQL 14+                                             │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ channels  │ │ posts    │ │ ads_*    │ │ settings     │  │
│  │ page_     │ │ insights │ │ campaigns│ │ (encrypted)  │  │
│  │ insights  │ │ metrics  │ │ adsets   │ │              │  │
│  └───────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│                                                             │
│  Extensions: pgcrypto · uuid-ossp                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Luồng dữ liệu chính

### 3.1 Luồng đồng bộ Facebook / Bundle → Dashboard

```
Facebook Graph API v25.0          Bundle.social API
        │                                │
        ▼                                ▼
  /api/channels/sync            /api/bundle/import
        │                                │
        ▼                                ▼
  lib/fb/insights.ts         lib/bundle/sync.ts
  lib/fb/posts.ts            (polling 5 phút/lần)
        │                                │
        └──────────┬─────────────────────┘
                   │
                   ▼
            lib/db.ts (pg Pool)
                   │
                   ▼
            PostgreSQL
       [channels, posts, page_insights,
        ads_campaigns, ads_adsets, ads_ads]
                   │
                   ▼
        Next.js Server Components
        (fetch trực tiếp từ DB, không qua API)
                   │
                   ▼
           Browser Dashboard
```

### 3.2 Luồng xác thực người dùng

```
User nhập email + password
        │
        ▼
POST /api/auth/login
        │
        ▼
lib/auth/rate-limit.ts
(kiểm tra IP rate limit)
        │
        ├── Vượt ngưỡng → 429 Too Many Requests
        │
        ▼
lib/auth/hash.ts
bcryptjs.compare(password, hash)
        │
        ├── Sai → 401 Unauthorized
        │
        ▼
iron-session.seal()
→ Set-Cookie: mos_session (HttpOnly, Secure, 7 ngày)
        │
        ▼
Redirect → /dashboard

Mọi request tiếp theo:
proxy.ts → getIronSession() → kiểm tra session.userId
        │
        ├── Không có session → Redirect /login
        │
        └── Có session → Tiếp tục xử lý
```

### 3.3 Luồng Telegram Bot

```
User gửi tin nhắn Telegram
        │
        ▼
Telegram Bot API
(setWebhook đã đăng ký)
        │
        ▼
POST /api/telegram/webhook
(route không bị chặn bởi proxy.ts)
        │
        ▼
lib/telegram/bot-handler.ts
(validate token, parse message)
        │
        ▼
lib/telegram/intent-parser.ts
→ OpenRouter API (Claude Haiku 4.5)
→ Phân tích intent + extract params
        │
        ▼
lib/telegram/query-executor.ts
→ lib/queries/*.ts
→ PostgreSQL SELECT
        │
        ▼
Format kết quả thành text/markdown
        │
        ▼
Telegram sendMessage API
→ Phản hồi cho user
```

### 3.4 Luồng Cron Jobs

```
Server khởi động
        │
        ▼
lib/cron/init.ts
→ node-cron.schedule(13 jobs)
        │
        ├── job-page-insights.ts    (mỗi ngày 01:00)
        ├── job-ads-ingestion.ts    (mỗi giờ)
        ├── job-bundle-sync.ts      (mỗi 5 phút)
        ├── job-news-monitor.ts     (mỗi 30 phút)
        └── ... (9 jobs khác)
               │
               ▼
        External API calls
        (FB Graph, Bundle, GA4, Apify)
               │
               ▼
        PostgreSQL upsert/insert
               │
               ▼
        (Dashboard tự refresh lần sau)

POST /api/admin/run-job
(trigger thủ công, không qua proxy)
        │
        ▼
Tìm job theo tên → execute ngay lập tức
```

---

## 4. Thiết kế module từng domain

### 4.1 `lib/fb/` — Facebook Integration

| File | Chức năng |
|---|---|
| `fb-api.ts` | Wrapper cho Facebook Graph API v25.0, xử lý rate limit và pagination |
| `insights.ts` | Lấy page insights theo ngày (impressions, reach, reactions, shares) |
| `posts.ts` | Đồng bộ bài đăng, reactions, comments |
| `ads.ts` | Campaigns, ad sets, ads — metrics conversion/spend/CPA |
| `oauth.ts` | Long-lived token exchange, page token management |

Thiết kế: Token được lưu trong PostgreSQL dạng mã hóa (`pgp_sym_encrypt`). Mỗi lần gọi API, module đọc token → giải mã → gọi FB → lưu kết quả.

### 4.2 `lib/bundle/` — Bundle.social Multi-platform

Bundle.social hỗ trợ async import (không trả về dữ liệu ngay). Luồng thiết kế:

```
1. POST /import → Bundle API → trả về import_id
2. Cron mỗi 5 phút: GET /import/{id}/status
3. Nếu status = "completed" → fetch data → upsert PostgreSQL
4. Nếu status = "pending" → bỏ qua, check lần sau
```

Hỗ trợ 10 nền tảng: TikTok, YouTube, Instagram, LinkedIn, Twitter, Pinterest, Reddit, Mastodon, Bluesky, Threads.

### 4.3 `lib/google/` — Google Integration

| Module | API | Dữ liệu |
|---|---|---|
| `ga4.ts` | Google Analytics Data API v1 | Sessions, pageviews, conversions, events |
| `sheets.ts` | Google Sheets API v4 | Export báo cáo, import cấu hình |
| `oauth.ts` | Google OAuth 2.0 | Refresh token tự động |

### 4.4 `lib/telegram/` — Bot Intelligence

- **bot-handler.ts**: Xác thực `X-Telegram-Bot-Api-Secret-Token`, parse update object, route đến intent parser.
- **intent-parser.ts**: Gửi message history + system prompt đến OpenRouter (Claude Haiku 4.5). Model trả về JSON structured intent `{ action, filters, dateRange }`.
- **query-executor.ts**: Map intent → query module → execute → format kết quả.

### 4.5 `lib/llm/` — LLM Abstraction

```typescript
// Cấu trúc provider
interface LLMProvider {
  chat(messages: Message[], options: LLMOptions): Promise<string>
}

// Providers
OpenRouter → Claude Haiku 4.5 (Telegram, nhanh, rẻ)
           → Claude Sonnet 4.6 / Opus 4.8 (chat phức tạp)
           → GPT-5.5 / Gemini / Grok (lựa chọn user)
Kieai     → Provider nội địa (fallback)
```

### 4.6 `lib/settings/` — Encrypted Settings

Tất cả API tokens, secrets được lưu trong bảng `settings` với giá trị mã hóa:

```sql
-- Lưu
UPDATE settings SET value = pgp_sym_encrypt($1, $2) WHERE key = $3;

-- Đọc
SELECT pgp_sym_decrypt(value::bytea, $1) FROM settings WHERE key = $2;
```

`$2` là `ENCRYPTION_KEY` từ environment variable, không bao giờ xuất hiện trong code.

### 4.7 `lib/queries/` — Query Modules

35 module SQL, mỗi module tương ứng một domain. Thiết kế:
- Tham số typed (TypeScript interface)
- Sử dụng parameterized queries (`$1, $2`) — tránh SQL injection
- Xử lý timezone: DB trả về UTC, convert sang `Asia/Ho_Chi_Minh` tại application layer

---

## 5. Thiết kế bảo mật

### 5.1 Xác thực & Phân quyền

```
Lớp 1: proxy.ts (Middleware Next.js)
  → Chặn TẤT CẢ route
  → Whitelist: /api/auth, /api/skills/upload, /api/news/ingest-*,
               /api/admin/run-job, /api/telegram/webhook,
               /_next, /favicon, /public, /login
  → Còn lại: getIronSession() → redirect /login nếu không có session

Lớp 2: API Route Handler
  → Mỗi route tự kiểm tra session
  → Role-based: session.role === 'admin' cho các route nhạy cảm

Lớp 3: Database
  → pg user có quyền tối thiểu (SELECT/INSERT/UPDATE trên các bảng cụ thể)
```

### 5.2 Mã hóa dữ liệu

| Loại dữ liệu | Phương pháp | Key source |
|---|---|---|
| API tokens (FB, Google, Bundle...) | `pgp_sym_encrypt` (pgcrypto) | `ENCRYPTION_KEY` env |
| Session cookie | iron-session sealed | `SESSION_PASSWORD` env |
| Mật khẩu người dùng | bcryptjs hash (3 rounds) | N/A (one-way) |
| MCP Bearer token | So sánh constant-time | `MCP_BEARER_TOKENS_JSON` env |

### 5.3 Rate Limiting

`lib/auth/rate-limit.ts` áp dụng cho `/api/auth/login`:
- Tối đa 5 lần thử / 15 phút / IP
- Lưu state trong memory (phù hợp single-instance deployment)
- Trả về `Retry-After` header khi bị chặn

### 5.4 Route Security Model

```
PUBLIC (không cần auth):
  /login, /_next/*, /favicon.ico, /public/*

WEBHOOK (có token validation riêng):
  /api/telegram/webhook  → X-Telegram-Bot-Api-Secret-Token
  /api/news/ingest-ads   → INGEST_SECRET header
  /api/news/ingest-web   → INGEST_SECRET header

ADMIN (cần auth + role admin):
  /api/admin/run-job     → session.role === 'admin'

AUTHENTICATED (cần session):
  Tất cả routes còn lại
```

---

## 6. Thiết kế tích hợp bên ngoài

### 6.1 Facebook Graph API v25.0

```
Endpoint: https://graph.facebook.com/v25.0/
Auth: Page Access Token (long-lived, mã hóa trong DB)
Rate limit: 200 calls/hour/token
Retry: Exponential backoff khi gặp rate limit (error code 4, 17, 32)

Dữ liệu thu thập:
  - Page Insights: reach, impressions, reactions, clicks (daily)
  - Posts: id, message, created_time, insights per post
  - Ads: campaigns → adsets → ads → insights (spend, impressions, clicks, conversions)
```

### 6.2 Bundle.social API

```
Endpoint: https://api.bundle.social/v1/
Auth: API Key (mã hóa trong DB)
Pattern: Async import với polling

Nền tảng: TikTok, YouTube, Instagram, LinkedIn, Twitter,
          Pinterest, Reddit, Mastodon, Bluesky, Threads

Luồng:
  POST /imports → { import_id }
  GET  /imports/{id} → { status: pending|processing|completed|failed }
  GET  /imports/{id}/data → [{ post_id, metrics, ... }]

Cron poll mỗi 5 phút cho các import đang pending/processing.
```

### 6.3 Google APIs

```
GA4 Data API v1:
  Endpoint: analyticsdata.googleapis.com
  Auth: Service Account JSON (mã hóa trong DB)
  Report: runReport({ dateRanges, metrics, dimensions })

Google Sheets API v4:
  Dùng để: export báo cáo tự động, import mapping dữ liệu
  Auth: cùng Service Account với GA4
```

### 6.4 OpenRouter (LLM Gateway)

```
Endpoint: https://openrouter.ai/api/v1/chat/completions
Auth: Bearer OPENROUTER_API_KEY

Models:
  claude-haiku-4-5    → Telegram intent parsing (fast, cost-efficient)
  claude-sonnet-4-6   → Chat dashboard (balanced)
  claude-opus-4-8     → Complex analysis (premium)
  gpt-5.5 / gemini / grok → User choice

Thiết kế: lib/llm/openrouter.ts nhận model ID dynamic → không hardcode model
```

### 6.5 Telegram Bot API

```
Webhook: POST /api/telegram/webhook
Bot API: https://api.telegram.org/bot{TOKEN}/

Methods dùng:
  sendMessage      → Phản hồi user
  sendChatAction   → typing... trong khi xử lý
  setWebhook       → Đăng ký webhook URL khi server start
```

### 6.6 Các tích hợp khác

| Service | Cách dùng | Auth |
|---|---|---|
| Apify | RSS monitoring, social listening | API Token |
| Lark/Feishu | Push dashboard metrics, ghi vào Base | Bot Token |
| Ladipage | Nhận webhook lead → forward n8n | Webhook secret |
| n8n | Automation pipeline nhận lead từ Ladipage | Webhook URL |

---

## 7. Thiết kế Cron / Scheduler

### 7.1 Kiến trúc Scheduler

Marketing OS dùng **node-cron in-process** — scheduler chạy trong cùng Node.js process với Next.js server. Không dùng external task queue (BullMQ, Agenda) hay cron hệ điều hành.

```
Server Start
    │
    ▼
lib/cron/init.ts
    │
    ├── Khởi tạo 13 cron jobs
    ├── Mỗi job là một closure với error handling
    └── Log execution time và kết quả vào DB
```

### 7.2 Danh sách Cron Jobs

| Job | Schedule | Chức năng |
|---|---|---|
| `job-page-insights` | `0 1 * * *` (01:00 hàng ngày) | Sync FB page insights ngày hôm qua |
| `job-ads-ingestion` | `0 * * * *` (mỗi giờ) | Sync FB ads campaigns/adsets/ads |
| `job-bundle-sync` | `*/5 * * * *` (5 phút) | Poll Bundle import status |
| `job-ga4-daily` | `0 2 * * *` (02:00 hàng ngày) | Import GA4 metrics ngày hôm qua |
| `job-news-monitor` | `*/30 * * * *` (30 phút) | Apify RSS, xử lý tin tức |
| `job-lark-push` | `0 8 * * 1-5` (8:00 các ngày thường) | Push báo cáo lên Lark |
| ... | ... | 7 jobs còn lại |

### 7.3 Manual Trigger

```
POST /api/admin/run-job
Body: { "job": "page-insights" }

→ Tìm job trong registry
→ Execute ngay lập tức (không đợi schedule)
→ Trả về { success, duration, rows_affected }
```

### 7.4 Error Handling trong Cron

```typescript
// Mỗi job được bọc trong try-catch
cron.schedule('0 1 * * *', async () => {
  const start = Date.now()
  try {
    const result = await runPageInsightsJob()
    await logJobRun('page-insights', 'success', Date.now() - start, result)
  } catch (error) {
    await logJobRun('page-insights', 'failed', Date.now() - start, error.message)
    // Không throw — tránh crash process
  }
})
```

---

## 8. Thiết kế MCP Server

### 8.1 Tổng quan

MCP (Model Context Protocol) Server cho phép AI assistant như Claude Desktop và Cursor IDE kết nối trực tiếp vào Marketing OS để query dữ liệu.

```
Claude Desktop / Cursor IDE
        │
        │ (stdio hoặc HTTP)
        ▼
src/mcp/server.ts
        │
        ├── Auth: Bearer token validation
        │   (MCP_BEARER_TOKENS_JSON = [{ "token": "...", "name": "..." }])
        │
        ├── Tool: channels
        │   → lib/queries/channels.ts → PostgreSQL
        │
        ├── Tool: posts
        │   → lib/queries/posts.ts → PostgreSQL
        │
        └── Tool: analytics
            → lib/queries/analytics.ts → PostgreSQL
```

### 8.2 Transport

| Transport | Dùng khi | Config |
|---|---|---|
| **stdio** | Claude Desktop (local) | `npx mcp-server stdio` |
| **HTTP** | Cursor IDE, remote client | `GET/POST /mcp/` với Bearer token |

### 8.3 Tools định nghĩa

```typescript
// Tool: channels
{
  name: "get_channels",
  description: "Lấy danh sách kênh mạng xã hội đã kết nối",
  inputSchema: {
    type: "object",
    properties: {
      platform: { type: "string", enum: ["facebook", "tiktok", "youtube", ...] }
    }
  }
}

// Tool: posts
{
  name: "get_posts",
  description: "Lấy bài đăng với metrics (reach, engagement)",
  inputSchema: {
    type: "object",
    properties: {
      channel_id: { type: "string" },
      date_from: { type: "string", format: "date" },
      date_to: { type: "string", format: "date" },
      limit: { type: "number", default: 20 }
    }
  }
}

// Tool: analytics
{
  name: "get_analytics",
  description: "Lấy analytics tổng hợp theo kênh và thời gian",
  inputSchema: { ... }
}
```

### 8.4 Bảo mật MCP

- Bearer token được đọc từ `MCP_BEARER_TOKENS_JSON` (array JSON)
- Mỗi token có `name` để audit log
- HTTP transport: token trong `Authorization: Bearer {token}` header
- stdio transport: token được pass qua environment variable khi khởi động

---

## 9. Quyết định kiến trúc (ADR)

### ADR-001: Chọn Next.js App Router thay vì Pages Router hoặc framework khác

**Trạng thái:** Đã quyết định  
**Bối cảnh:** Marketing OS cần dashboard với dữ liệu real-time từ DB, không cần SEO.

**Quyết định:** Dùng Next.js 15 App Router với Server Components.

**Lý do:**
- **Server Components (RSC)** cho phép fetch dữ liệu trực tiếp từ PostgreSQL trong component — không cần tầng API riêng cho dashboard, giảm round-trip.
- **Output: standalone** tạo bundle nhỏ, deploy Docker không cần `node_modules` đầy đủ — phù hợp Coolify.
- **Route Groups** `(authenticated)/` tách biệt layout xác thực sạch hơn Pages Router.
- **Co-location**: API Routes nằm cùng repo với UI — dễ maintain cho team nhỏ.

**Đánh đổi:** App Router phức tạp hơn Pages Router; cần hiểu rõ client/server boundary.

---

### ADR-002: Chọn iron-session thay vì JWT hoặc NextAuth

**Trạng thái:** Đã quyết định  
**Bối cảnh:** Cần session management đơn giản, không cần OAuth provider phức tạp.

**Quyết định:** Dùng `iron-session` với cookie `mos_session`.

**Lý do:**
- **Stateless server**: Session data mã hóa trong cookie — server không cần lưu session store (Redis), phù hợp single-instance.
- **Đơn giản**: iron-session chỉ là encrypt/decrypt cookie, không có magic routing như NextAuth.
- **Kiểm soát**: Hoàn toàn tự định nghĩa session schema — thêm `role`, `userId`, `teamId` tùy ý.
- **7 ngày TTL**: Người dùng nội bộ, không cần rotation phức tạp.

**Đánh đổi:** Không revoke được session (không có server-side session store) — acceptable vì đây là internal tool.

---

### ADR-003: Chọn node-cron in-process thay vì external task queue

**Trạng thái:** Đã quyết định  
**Bối cảnh:** Cần 13 scheduled jobs chạy đều đặn để sync dữ liệu.

**Quyết định:** `node-cron` khởi động trong cùng process Next.js (trong `lib/cron/init.ts`).

**Lý do:**
- **Zero infrastructure**: Không cần Redis, BullMQ, Celery, hay cron daemon riêng — phù hợp deploy Coolify đơn giản.
- **Single deployment**: Toàn bộ logic nằm trong một container, không cần orchestrate nhiều service.
- **Đủ dùng**: 13 jobs, mỗi job chạy I/O-bound (API calls, DB writes) — không có CPU-intensive job cần worker riêng.
- **Debug dễ**: Log tập trung trong một process, không cần trace qua nhiều service.

**Đánh đổi:** Nếu server restart, job đang chạy bị interrupt. Acceptable vì jobs có idempotent design (upsert thay vì insert).

**Ràng buộc:** Chỉ phù hợp single-instance. Nếu scale horizontal trong tương lai, cần migrate sang distributed lock (Redis) hoặc external queue.

---

### ADR-004: Chọn pgcrypto thay vì application-level encryption

**Trạng thái:** Đã quyết định  
**Bối cảnh:** Cần lưu trữ API tokens (FB, Google, Bundle...) một cách an toàn trong PostgreSQL.

**Quyết định:** Dùng `pgp_sym_encrypt`/`pgp_sym_decrypt` từ extension `pgcrypto`.

**Lý do:**
- **Encryption at rest tại DB**: Token được mã hóa trước khi ghi vào disk — ngay cả khi DB dump bị lộ, tokens vẫn an toàn (cần `ENCRYPTION_KEY`).
- **Tích hợp tự nhiên**: `pgcrypto` là extension chính thức của PostgreSQL, không cần thư viện ngoài.
- **Key separation**: `ENCRYPTION_KEY` nằm trong environment variable (Coolify secret), tách biệt hoàn toàn khỏi data.
- **Không tăng complexity code**: Mã hóa/giải mã nằm trong SQL query — application code chỉ truyền key.

**Đánh đổi:** `ENCRYPTION_KEY` phải được quản lý cẩn thận (không được lưu trong Git). Rotation key phức tạp — cần migrate toàn bộ dữ liệu đã mã hóa.

---

*Tài liệu này phản ánh kiến trúc tại phiên bản hiện tại. Cập nhật khi có thay đổi kiến trúc quan trọng.*
