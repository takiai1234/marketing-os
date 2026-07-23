# 03 — Thiết Kế Cơ Sở Dữ Liệu (Database Design Document)

**Hệ thống:** Marketing OS  
**Phiên bản tài liệu:** 1.0  
**Ngày cập nhật:** 2026-07-22  
**Tác giả:** Team Engineering  

---

## Mục lục

1. [Tổng quan thiết kế](#1-tổng-quan-thiết-kế)
2. [Công nghệ & lý do lựa chọn](#2-công-nghệ--lý-do-lựa-chọn)
3. [Nguyên tắc thiết kế](#3-nguyên-tắc-thiết-kế)
4. [ENUM Types](#4-enum-types)
5. [ERD — Sơ đồ quan hệ thực thể](#5-erd--sơ-đồ-quan-hệ-thực-thể)
6. [Mô tả chi tiết từng bảng](#6-mô-tả-chi-tiết-từng-bảng)
7. [Index Strategy](#7-index-strategy)
8. [Chiến lược mã hoá dữ liệu nhạy cảm](#8-chiến-lược-mã-hoá-dữ-liệu-nhạy-cảm)
9. [Naming Conventions](#9-naming-conventions)
10. [Migration Strategy](#10-migration-strategy)

---

## 1. Tổng quan thiết kế

Marketing OS là nền tảng quản lý marketing tích hợp, tổng hợp dữ liệu từ nhiều kênh mạng xã hội (Facebook, TikTok, YouTube, Instagram...), hệ thống quảng cáo (Facebook Ads, Google Ads, TikTok Ads), landing page (GA4), và các công cụ AI nội bộ (skill library, project workspace).

Cơ sở dữ liệu được thiết kế để đáp ứng các yêu cầu sau:

- **Đa kênh:** Hỗ trợ 13+ nền tảng mạng xã hội và 3 nền tảng quảng cáo trong một schema thống nhất.
- **Dữ liệu time-series:** Các chỉ số hiệu suất (metric) được lưu theo từng ngày để phân tích xu hướng.
- **Bảo mật:** Token API và API keys của bên thứ ba được mã hoá bằng pgcrypto trước khi lưu vào database.
- **Khả năng mở rộng:** Dữ liệu thô (raw) được lưu dưới dạng JSONB để linh hoạt khi các nền tảng thay đổi schema.
- **Audit & traceability:** Mọi thay đổi trên brief đều có log, mọi lần đồng bộ dữ liệu đều được ghi nhận.

---

## 2. Công nghệ & lý do lựa chọn

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| RDBMS | **PostgreSQL 14+** | Hỗ trợ JSONB, UUID, ENUM, pgcrypto; ACID compliance; hệ sinh thái mạnh |
| Extension | **pgcrypto** | Mã hoá/giải mã đối xứng AES ngay tại database layer, không phụ thuộc application |
| Migration tool | **node-pg-migrate** | Tương thích Node.js/TypeScript; hỗ trợ up/down migration; quản lý version rõ ràng |
| UUID | **gen_random_uuid()** | Tránh xung đột ID khi import dữ liệu từ nhiều nguồn; không tiết lộ thứ tự bản ghi |
| Tiền tệ | **BIGINT (micros)** | Tránh lỗi làm tròn số thực khi tính toán chi phí quảng cáo (1 VND = 1000 micros) |

---

## 3. Nguyên tắc thiết kế

**3.1 Idempotent Upsert**  
Mọi bảng metric theo ngày (`*_daily`) đều có constraint `UNIQUE(entity_id, date)`, cho phép các job đồng bộ chạy `INSERT ... ON CONFLICT DO UPDATE` an toàn mà không tạo dữ liệu trùng lặp.

**3.2 Soft Reference với nullable FK**  
Các bảng như `alert` và `api_sync_log` có FK nullable đến `social_account`, cho phép ghi nhận sự kiện hệ thống không gắn với kênh cụ thể.

**3.3 Tách biệt raw data và computed data**  
Cột `raw_metrics JSONB` trong `account_metric_daily` lưu dữ liệu gốc từ API. Các cột còn lại là dữ liệu đã được chuẩn hoá. Điều này giúp tái tính toán (recompute) khi logic nghiệp vụ thay đổi mà không cần gọi lại API.

**3.4 Mã hoá tại tầng database**  
Access token và API key được mã hoá bằng `pgp_sym_encrypt` trước khi INSERT, và chỉ được giải mã tại tầng ứng dụng khi cần sử dụng.

**3.5 Không xoá dữ liệu lịch sử**  
Dữ liệu metric và log không bao giờ bị DELETE. Trạng thái được quản lý qua cột `status`.

---

## 4. ENUM Types

### `platform_t` — Nền tảng mạng xã hội
```sql
CREATE TYPE platform_t AS ENUM (
  'facebook', 'tiktok', 'youtube', 'instagram', 'threads',
  'zalo', 'linkedin', 'pinterest', 'reddit', 'mastodon',
  'bluesky', 'twitter'
);
```

### `account_status_t` — Trạng thái kết nối kênh
```sql
CREATE TYPE account_status_t AS ENUM (
  'active',         -- Kết nối bình thường
  'token_expired',  -- Token đã hết hạn, cần re-auth
  'disconnected'    -- Đã ngắt kết nối thủ công
);
```

### `post_type_t` — Loại bài đăng
```sql
CREATE TYPE post_type_t AS ENUM (
  'photo', 'video', 'reel', 'status', 'link',
  'album', 'sticker', 'share'
);
```

### `severity_t` — Mức độ cảnh báo
```sql
CREATE TYPE severity_t AS ENUM (
  'info',     -- Thông tin thông thường
  'warning',  -- Cảnh báo cần chú ý
  'critical'  -- Nghiêm trọng, cần xử lý ngay
);
```

### `sync_type_t` — Loại tác vụ đồng bộ
```sql
CREATE TYPE sync_type_t AS ENUM (
  'page_insights',   -- Đồng bộ insights kênh từ Facebook
  'posts',           -- Đồng bộ bài đăng
  'health_recompute',-- Tính lại health score
  'ladipage',        -- Đồng bộ leads từ LadiPage
  'news_ingestion',  -- Thu thập tin tức
  'message_sync',    -- Đồng bộ Messenger/inbox
  'ga4_sync',        -- Đồng bộ dữ liệu Google Analytics 4
  'ads_ingestion',   -- Đồng bộ dữ liệu quảng cáo
  'bundle_import',   -- Import từ Bundle.social
  'apify_news'       -- Thu thập tin tức qua Apify
);
```

### `ad_platform_t` — Nền tảng quảng cáo
```sql
CREATE TYPE ad_platform_t AS ENUM ('facebook', 'google', 'tiktok');
```

### `ad_account_status_t` — Trạng thái tài khoản quảng cáo
```sql
CREATE TYPE ad_account_status_t AS ENUM (
  'pending',      -- Chờ xác thực
  'active',       -- Đang hoạt động
  'disconnected', -- Đã ngắt kết nối
  'error'         -- Lỗi kết nối
);
```

---

## 5. ERD — Sơ đồ quan hệ thực thể

```
┌──────────────────┐
│   team_member    │
│──────────────────│
│ id (PK)          │
│ email (UNIQUE)   │
│ name             │
│ role             │
│ bundle_team_id   │
└────────┬─────────┘
         │ 1
         │ owner_id
         ├──────────────────────────────────────┐
         │                                      │
         │ n                                    │ n
    ┌────▼─────────┐                    ┌───────▼──────┐
    │    brief     │                    │  skill_lib   │
    │──────────────│                    │──────────────│
    │ id (PK)      │                    │ id (PK)      │
    │ owner_id(FK) │                    │ slug(UNIQUE) │
    │ title        │                    │ uploaded_by  │
    │ status       │                    └──────┬───────┘
    └──────┬───────┘                           │ 1
           │ 1                                 │ skill_id
           │ brief_id                          │ n
    ┌──────▼────────────┐             ┌────────▼──────────────┐
    │  brief_activity   │             │  skill_chat_session   │
    │───────────────────│             │───────────────────────│
    │ id (PK)           │             │ id (PK)               │
    │ brief_id (FK)     │             │ skill_id (FK)         │
    │ actor_id (FK)     │             │ user_id (FK)          │
    │ action            │             └────────┬──────────────┘
    │ changes (JSONB)   │                      │ 1
    └───────────────────┘                      │ session_id
                                               │ n
                                    ┌──────────▼─────────────┐
                                    │  skill_chat_message    │
                                    │────────────────────────│
                                    │ id (PK)                │
                                    │ session_id (FK)        │
                                    │ role, content, tokens  │
                                    └────────────────────────┘

┌──────────────────────┐
│   social_account     │
│──────────────────────│
│ id (PK)              │
│ platform             │◄────────────────┐
│ external_id (UNIQUE) │                 │
│ name                 │                 │
│ access_token_enc     │                 │
│ status               │                 │
└───────┬──────────────┘                 │
        │ 1                              │
        ├──────────────────────────┐     │
        │                          │     │
        │ n (account_id)           │ n   │ (FK nullable)
  ┌─────▼──────────────┐    ┌──────▼─────▼─────────┐
  │    social_post     │    │  account_metric_daily │
  │────────────────────│    │──────────────────────│
  │ id (PK)            │    │ account_id (FK)      │
  │ account_id (FK)    │    │ date                 │
  │ external_id        │    │ followers            │
  │ content            │    │ total_reach          │
  │ post_type          │    │ raw_metrics (JSONB)  │
  └─────┬──────────────┘    └──────────────────────┘
        │ 1
        │ post_id             ┌──────────────────────┐
        │ n                   │ channel_health_daily  │
  ┌─────▼──────────────┐     │──────────────────────│
  │ post_metric_daily  │     │ account_id (FK)      │
  │────────────────────│     │ health_score         │
  │ post_id (FK)       │     │ er_score             │
  │ date               │     │ consistency_score    │
  │ reactions          │     └──────────────────────┘
  │ reach, impressions │
  └────────────────────┘     ┌──────────────────────┐
                             │  page_message_daily   │
                             │──────────────────────│
                             │ account_id (FK)      │
                             │ new_conversations    │
                             │ response_rate        │
                             └──────────────────────┘

┌──────────────────────┐
│     ad_account       │
│──────────────────────│
│ id (PK)              │
│ platform             │
│ external_id          │
│ access_token_enc     │
│ status               │
└───────┬──────────────┘
        │ 1
        │ n (ad_account_id)
  ┌─────▼──────────────┐
  │    ad_campaign     │
  │────────────────────│
  │ id (PK)            │
  │ ad_account_id (FK) │
  │ name, objective    │
  │ status             │
  └─────┬──────────────┘
        │ 1
        │ n (campaign_id)
  ┌─────▼──────────────┐
  │  ad_metric_daily   │
  │────────────────────│
  │ campaign_id (FK)   │
  │ date               │
  │ spend_micros       │
  │ impressions, reach │
  │ conversions        │
  └────────────────────┘

┌──────────────────────┐       ┌─────────────────────────────┐
│    landing_page      │       │  social_account_member (n-n) │
│──────────────────────│       │─────────────────────────────│
│ id (PK)              │       │ account_id (FK)             │
│ name, url            │◄──┐   │ member_id (FK)              │
│ ga4_property_id      │   │   │ PK(account_id, member_id)   │
└───────┬──────────────┘   │   └─────────────────────────────┘
        │ 1                │
        ├──────────────────┤
        │                  │
  ┌─────▼──────────────┐  ┌▼────────────────────┐
  │landing_page_ga4_   │  │landing_page_lead_   │
  │session             │  │daily                │
  │────────────────────│  │─────────────────────│
  │ landing_page_id FK │  │ landing_page_id FK  │
  │ date, sessions     │  │ date, leads         │
  └────────────────────┘  └─────────────────────┘

┌──────────────────────┐    ┌──────────────────────┐
│    api_sync_log      │    │       alert          │
│──────────────────────│    │──────────────────────│
│ sync_type            │    │ severity             │
│ account_id (FK,null) │    │ type, title          │
│ status, records      │    │ account_id (FK,null) │
│ error_message        │    │ post_id (FK,null)    │
└──────────────────────┘    │ read_at              │
                            └──────────────────────┘

┌──────────────────────┐    ┌──────────────────────┐
│    channel_tag       │    │    app_setting       │
│──────────────────────│    │──────────────────────│
│ id (PK)              │    │ key (PK)             │
│ name, slug (UNIQUE)  │    │ value_encrypted      │
│ color_hex            │    │ (pgcrypto)           │
└──────────────────────┘    └──────────────────────┘
```

**Quan hệ n-n:**
- `social_account` ↔ `team_member` thông qua bảng trung gian `social_account_member`

---

## 6. Mô tả chi tiết từng bảng

### 6.1 `team_member` — Người dùng hệ thống

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Định danh duy nhất |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Email đăng nhập |
| `name` | VARCHAR(255) | NOT NULL | Tên hiển thị |
| `role` | VARCHAR(50) | NOT NULL | Vai trò: `admin` hoặc `member` |
| `password_hash` | VARCHAR(255) | | Mật khẩu đã hash (bcrypt) |
| `bundle_team_id` | VARCHAR(100) | | ID team trên Bundle.social |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Thời điểm tạo |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Thời điểm cập nhật cuối |

---

### 6.2 `social_account` — Kênh mạng xã hội

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | Định danh nội bộ |
| `platform` | platform_t | NOT NULL | Nền tảng mạng xã hội |
| `external_id` | VARCHAR(100) | NOT NULL | ID trang/kênh trên nền tảng |
| `name` | VARCHAR(255) | | Tên kênh (tự động cập nhật từ API) |
| `access_token_encrypted` | TEXT | | Token mã hoá bằng pgcrypto |
| `is_manual` | BOOLEAN | DEFAULT false | True nếu nhập tay, không có API |
| `status` | account_status_t | DEFAULT 'active' | Trạng thái kết nối |
| `last_synced_at` | TIMESTAMPTZ | | Thời điểm đồng bộ gần nhất |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Thời điểm tạo |
| **UNIQUE** | | (platform, external_id) | Không trùng kênh |

---

### 6.3 `social_post` — Bài đăng

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | Định danh nội bộ |
| `account_id` | UUID | FK → social_account | Kênh chứa bài đăng |
| `external_id` | VARCHAR(100) | NOT NULL | ID bài đăng trên nền tảng |
| `content` | TEXT | | Nội dung văn bản |
| `post_type` | post_type_t | | Loại bài đăng |
| `published_at` | TIMESTAMPTZ | | Thời điểm đăng |
| `media_urls` | TEXT[] | | Danh sách URL ảnh/video |
| `thumbnail_url` | TEXT | | Ảnh đại diện bài đăng |
| `permalink_url` | TEXT | | Link trực tiếp đến bài đăng |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Thời điểm tạo bản ghi |
| **UNIQUE** | | (account_id, external_id) | Không trùng bài đăng trong kênh |

---

### 6.4 `post_metric_daily` — Chỉ số bài đăng theo ngày

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `post_id` | UUID | FK → social_post | Bài đăng tham chiếu |
| `date` | DATE | NOT NULL | Ngày ghi nhận |
| `reactions` | INT | DEFAULT 0 | Tổng reactions (like, love...) |
| `comments` | INT | DEFAULT 0 | Số bình luận |
| `shares` | INT | DEFAULT 0 | Số lượt chia sẻ |
| `reach` | INT | DEFAULT 0 | Số người tiếp cận |
| `impressions` | INT | DEFAULT 0 | Số lần hiển thị |
| `clicks` | INT | DEFAULT 0 | Số lượt click |
| `engagement_rate` | NUMERIC(8,4) | | Tỷ lệ tương tác (%) |
| `video_views` | INT | DEFAULT 0 | Số lượt xem video |
| `updated_at` | TIMESTAMPTZ | | Thời điểm cập nhật cuối |
| **UNIQUE** | | (post_id, date) | Mỗi ngày 1 bản ghi/bài đăng |

---

### 6.5 `account_metric_daily` — Chỉ số kênh theo ngày

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `account_id` | UUID | FK → social_account | Kênh tham chiếu |
| `date` | DATE | NOT NULL | Ngày ghi nhận |
| `followers` | INT | | Tổng người theo dõi |
| `follower_growth` | INT | | Tăng trưởng followers trong ngày |
| `posts_count` | INT | | Số bài đăng trong ngày |
| `total_reach` | INT | | Tổng reach trong ngày |
| `total_engagement` | INT | | Tổng tương tác trong ngày |
| `manual_leads` | INT | DEFAULT 0 | Leads nhập tay trong ngày |
| `raw_metrics` | JSONB | | Dữ liệu thô từ API |
| `updated_at` | TIMESTAMPTZ | | |
| **UNIQUE** | | (account_id, date) | |

---

### 6.6 `channel_health_daily` — Health score kênh

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `account_id` | UUID | FK → social_account | |
| `date` | DATE | NOT NULL | |
| `health_score` | NUMERIC(5,2) | | Điểm sức khoẻ tổng hợp (0–100) |
| `er_score` | NUMERIC(5,2) | | Điểm engagement rate |
| `consistency_score` | NUMERIC(5,2) | | Điểm tần suất đăng bài |
| `growth_score` | NUMERIC(5,2) | | Điểm tăng trưởng followers |
| `reach_score` | NUMERIC(5,2) | | Điểm tiếp cận |
| `updated_at` | TIMESTAMPTZ | | |
| **UNIQUE** | | (account_id, date) | |

---

### 6.7 `page_message_daily` — Metrics tin nhắn/inbox

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `account_id` | UUID | FK → social_account | |
| `date` | DATE | NOT NULL | |
| `new_conversations` | INT | | Số cuộc hội thoại mới |
| `response_rate` | NUMERIC(5,2) | | Tỷ lệ phản hồi (%) |
| `response_time_minutes` | NUMERIC(8,2) | | Thời gian phản hồi trung bình (phút) |
| `updated_at` | TIMESTAMPTZ | | |
| **UNIQUE** | | (account_id, date) | |

---

### 6.8 `ad_account` — Tài khoản quảng cáo

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `platform` | ad_platform_t | NOT NULL | Nền tảng: facebook/google/tiktok |
| `external_id` | VARCHAR(100) | NOT NULL | ID tài khoản trên nền tảng |
| `name` | VARCHAR(255) | | Tên tài khoản quảng cáo |
| `access_token_encrypted` | TEXT | | Token mã hoá |
| `status` | ad_account_status_t | DEFAULT 'pending' | Trạng thái kết nối |
| `last_synced_at` | TIMESTAMPTZ | | |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.9 `ad_campaign` — Chiến dịch quảng cáo

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `ad_account_id` | UUID | FK → ad_account | Tài khoản chứa chiến dịch |
| `external_id` | VARCHAR(100) | NOT NULL | ID chiến dịch trên nền tảng |
| `name` | VARCHAR(500) | | Tên chiến dịch |
| `objective` | VARCHAR(100) | | Mục tiêu (CONVERSIONS, REACH...) |
| `status` | VARCHAR(50) | | ACTIVE / PAUSED / ARCHIVED |
| `created_at` | TIMESTAMPTZ | | Ngày tạo chiến dịch |
| **UNIQUE** | | (ad_account_id, external_id) | |

---

### 6.10 `ad_metric_daily` — Chỉ số quảng cáo theo ngày

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `campaign_id` | UUID | FK → ad_campaign | |
| `date` | DATE | NOT NULL | |
| `spend_micros` | BIGINT | | Chi phí (VND × 1000, tránh lỗi float) |
| `impressions` | BIGINT | | Số lần hiển thị |
| `reach` | BIGINT | | Số người tiếp cận |
| `clicks` | BIGINT | | Số lượt nhấp |
| `conversions` | BIGINT | | Số chuyển đổi |
| `revenue_micros` | BIGINT | | Doanh thu quy đổi (VND × 1000) |
| `updated_at` | TIMESTAMPTZ | | |
| **UNIQUE** | | (campaign_id, date) | |

> **Lưu ý:** Để lấy giá trị VND thực tế: `spend_micros / 1000.0`

---

### 6.11 `brief` — Brief nội dung

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `owner_id` | UUID | FK → team_member | Người tạo brief |
| `title` | VARCHAR(500) | NOT NULL | Tiêu đề brief |
| `description` | TEXT | | Mô tả yêu cầu |
| `status` | VARCHAR(50) | | draft / in_review / approved / published |
| `published_content` | TEXT | | Nội dung đã xuất bản cuối cùng |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.12 `brief_activity` — Audit log brief

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `brief_id` | UUID | FK → brief | Brief liên quan |
| `actor_id` | UUID | FK → team_member | Người thực hiện hành động |
| `action` | VARCHAR(100) | NOT NULL | Tên hành động (created, approved...) |
| `changes` | JSONB | | Diff trước/sau thay đổi |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.13 `skill_lib` — Thư viện kỹ năng AI

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | Định danh ngắn gọn của skill |
| `name` | VARCHAR(255) | NOT NULL | Tên hiển thị |
| `sha256` | VARCHAR(64) | | Hash nội dung để kiểm tra toàn vẹn |
| `storage_path` | TEXT | | Đường dẫn file trên object storage |
| `uploaded_by` | UUID | FK → team_member | Người tải lên |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.14 `skill_chat_session` — Phiên chat với skill AI

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `skill_id` | UUID | FK → skill_lib | Skill được dùng |
| `user_id` | UUID | FK → team_member | Người dùng |
| `model` | VARCHAR(100) | | Model AI được dùng (claude-sonnet-...) |
| `title` | VARCHAR(500) | | Tiêu đề phiên chat |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.15 `skill_chat_message` — Tin nhắn trong phiên chat

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `session_id` | UUID | FK → skill_chat_session | Phiên chat chứa tin nhắn |
| `role` | VARCHAR(20) | NOT NULL | `user` hoặc `assistant` |
| `content` | TEXT | | Nội dung tin nhắn |
| `tokens_in` | INT | | Số token đầu vào |
| `tokens_out` | INT | | Số token đầu ra |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.16 `project` — Project AI workspace

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `owner_id` | UUID | FK → team_member | Chủ sở hữu project |
| `name` | VARCHAR(255) | NOT NULL | Tên project |
| `instructions` | TEXT | | System prompt / hướng dẫn AI |
| `icon` | VARCHAR(50) | | Emoji hoặc icon identifier |
| `color_hex` | VARCHAR(7) | | Màu hiển thị (#RRGGBB) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.17 `project_file` — File kiến thức trong project

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `project_id` | UUID | FK → project | Project chứa file |
| `filename` | VARCHAR(255) | NOT NULL | Tên file gốc |
| `content_text` | TEXT | | Nội dung văn bản đã trích xuất |
| `storage_path` | TEXT | | Đường dẫn file gốc trên storage |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.18 `project_chat_session` & `project_chat_message`

Cấu trúc tương tự `skill_chat_session` và `skill_chat_message`, nhưng FK tham chiếu đến `project` thay vì `skill_lib`. Dùng để lưu lịch sử hội thoại trong từng project workspace.

---

### 6.19 `news_article` — Tin tức marketing

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `source` | VARCHAR(255) | | Nguồn tin (tên website/feed) |
| `title` | TEXT | NOT NULL | Tiêu đề bài viết |
| `link` | TEXT | UNIQUE, NOT NULL | URL bài viết (dùng làm dedup key) |
| `description` | TEXT | | Tóm tắt nội dung |
| `published_at` | TIMESTAMPTZ | | Ngày xuất bản gốc |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Ngày thu thập |

---

### 6.20 `landing_page` — Landing page theo dõi

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `name` | VARCHAR(255) | NOT NULL | Tên hiển thị |
| `url` | TEXT | NOT NULL | URL landing page |
| `ga4_property_id` | VARCHAR(100) | | Property ID trên Google Analytics 4 |
| `sheet_id` | VARCHAR(100) | | Google Sheet ID để sync leads |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.21 `landing_page_ga4_session` — Sessions GA4 theo ngày

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `landing_page_id` | UUID | FK → landing_page | |
| `date` | DATE | NOT NULL | |
| `sessions` | INT | DEFAULT 0 | Số phiên truy cập |
| `pageviews` | INT | DEFAULT 0 | Số lượt xem trang |
| `updated_at` | TIMESTAMPTZ | | |
| **UNIQUE** | | (landing_page_id, date) | |

---

### 6.22 `landing_page_lead_daily` — Leads landing page theo ngày

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `landing_page_id` | UUID | FK → landing_page | |
| `date` | DATE | NOT NULL | |
| `leads` | INT | DEFAULT 0 | Số leads trong ngày |
| `updated_at` | TIMESTAMPTZ | | |
| **UNIQUE** | | (landing_page_id, date) | |

---

### 6.23 `manual_revenue` — Doanh thu nhập tay

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `channel_name` | VARCHAR(255) | | Tên kênh/nguồn doanh thu |
| `amount_vnd` | BIGINT | NOT NULL | Số tiền (VND) |
| `date` | DATE | NOT NULL | Ngày ghi nhận |
| `note` | TEXT | | Ghi chú bổ sung |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.24 `manual_conversion` — Conversion nhập tay

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `source_account_id` | UUID | FK → social_account | Kênh nguồn |
| `conversion_count` | INT | NOT NULL | Số conversion |
| `revenue_vnd` | BIGINT | | Doanh thu quy đổi (VND) |
| `date` | DATE | NOT NULL | Ngày ghi nhận |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.25 `api_sync_log` — Lịch sử đồng bộ dữ liệu

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `sync_type` | sync_type_t | NOT NULL | Loại tác vụ đồng bộ |
| `account_id` | UUID | FK → social_account, NULL | Kênh liên quan (nếu có) |
| `status` | VARCHAR(20) | NOT NULL | success / error / partial |
| `records_upserted` | INT | DEFAULT 0 | Số bản ghi đã upsert |
| `error_message` | TEXT | | Chi tiết lỗi nếu thất bại |
| `started_at` | TIMESTAMPTZ | NOT NULL | Thời điểm bắt đầu |
| `finished_at` | TIMESTAMPTZ | | Thời điểm kết thúc |

---

### 6.26 `alert` — Cảnh báo hệ thống

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `severity` | severity_t | NOT NULL | Mức độ: info / warning / critical |
| `type` | VARCHAR(100) | NOT NULL | Phân loại cảnh báo (token_expired...) |
| `title` | VARCHAR(255) | NOT NULL | Tiêu đề cảnh báo |
| `message` | TEXT | | Nội dung chi tiết |
| `account_id` | UUID | FK, NULL | Kênh liên quan |
| `post_id` | UUID | FK, NULL | Bài đăng liên quan |
| `read_at` | TIMESTAMPTZ | | Null nếu chưa đọc |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.27 `app_setting` — Cài đặt hệ thống

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `key` | VARCHAR(100) | PK | Tên cài đặt (vd: `OPENAI_API_KEY`) |
| `value_encrypted` | TEXT | | Giá trị mã hoá bằng pgcrypto |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

### 6.28 `channel_tag` — Tag phân loại kênh

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `name` | VARCHAR(100) | NOT NULL | Tên tag hiển thị |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL | Slug định danh (vd: `brand-page`) |
| `color_hex` | VARCHAR(7) | | Màu tag (#RRGGBB) |

---

### 6.29 `social_account_member` — Quyền truy cập kênh (n-n)

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `account_id` | UUID | FK → social_account | |
| `member_id` | UUID | FK → team_member | |
| **PRIMARY KEY** | | (account_id, member_id) | Khoá chính tổng hợp |

Bảng trung gian này kiểm soát kênh nào mà mỗi thành viên có quyền xem/quản lý.

---

### 6.30 `bundle_import_pending` — Theo dõi import Bundle.social

| Cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|-----|-------------|-----------|-------|
| `id` | UUID | PK | |
| `bundle_import_id` | VARCHAR(100) | NOT NULL | ID batch import trên Bundle.social |
| `account_id` | UUID | FK → social_account | Kênh đang được import |
| `status` | VARCHAR(50) | | pending / processing / done / failed |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

---

## 7. Index Strategy

### 7.1 Index cho bảng metric theo ngày

Các bảng `*_daily` được truy vấn phổ biến theo pattern `WHERE account_id = $1 AND date BETWEEN $2 AND $3`:

```sql
-- account_metric_daily
CREATE INDEX idx_account_metric_daily_account_date
  ON account_metric_daily (account_id, date DESC);

-- post_metric_daily
CREATE INDEX idx_post_metric_daily_post_date
  ON post_metric_daily (post_id, date DESC);

-- channel_health_daily
CREATE INDEX idx_channel_health_daily_account_date
  ON channel_health_daily (account_id, date DESC);

-- ad_metric_daily
CREATE INDEX idx_ad_metric_daily_campaign_date
  ON ad_metric_daily (campaign_id, date DESC);
```

### 7.2 Index tra cứu theo external_id

Dùng khi đồng bộ dữ liệu (upsert lookup):

```sql
CREATE INDEX idx_social_account_external_id ON social_account (external_id);
CREATE INDEX idx_social_post_external_id ON social_post (external_id);
CREATE INDEX idx_ad_campaign_external_id ON ad_campaign (external_id);
```

### 7.3 Index theo owner và trạng thái

```sql
-- Lọc brief theo người tạo và trạng thái
CREATE INDEX idx_brief_owner_status ON brief (owner_id, status, created_at DESC);

-- Lọc bài đăng theo tài khoản và thời gian
CREATE INDEX idx_social_post_account_published
  ON social_post (account_id, published_at DESC);
```

### 7.4 Index cho audit log và cảnh báo

```sql
-- Tìm log gần nhất
CREATE INDEX idx_api_sync_log_started ON api_sync_log (started_at DESC);
CREATE INDEX idx_api_sync_log_account ON api_sync_log (account_id, started_at DESC);

-- Cảnh báo chưa đọc
CREATE INDEX idx_alert_unread ON alert (read_at, created_at DESC)
  WHERE read_at IS NULL;
```

### 7.5 Index full-text cho tin tức

```sql
CREATE INDEX idx_news_article_title_fts
  ON news_article USING GIN (to_tsvector('simple', title));
```

---

## 8. Chiến lược mã hoá dữ liệu nhạy cảm

### 8.1 Dữ liệu cần mã hoá

| Bảng | Cột | Loại dữ liệu |
|------|-----|-------------|
| `social_account` | `access_token_encrypted` | Facebook/TikTok/YouTube Page Token |
| `ad_account` | `access_token_encrypted` | Ads API Token |
| `app_setting` | `value_encrypted` | API keys (OpenAI, Anthropic...) |
| `team_member` | `password_hash` | Mật khẩu (bcrypt, không dùng pgcrypto) |

### 8.2 Cơ chế mã hoá với pgcrypto

Extension `pgcrypto` cung cấp mã hoá đối xứng AES-256 ngay tại database layer:

```sql
-- Cài extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Mã hoá khi INSERT/UPDATE
INSERT INTO social_account (access_token_encrypted, ...)
VALUES (pgp_sym_encrypt('raw_token_value', current_setting('app.encryption_key')), ...);

-- Giải mã khi đọc
SELECT pgp_sym_decrypt(access_token_encrypted::bytea, current_setting('app.encryption_key'))
FROM social_account WHERE id = $1;
```

### 8.3 Quản lý encryption key

- **Biến môi trường:** `ENCRYPTION_KEY` được inject vào process environment, không bao giờ lưu trong codebase.
- **Đặt session variable:** Tại đầu mỗi database connection, ứng dụng chạy `SET app.encryption_key = $key`.
- **Rotation:** Khi cần đổi key, chạy script đọc-giải mã-mã hoá lại từng bản ghi trong transaction.
- **Audit:** Mọi lần giải mã token đều đi qua service layer có log, không query trực tiếp từ tầng UI.

### 8.4 Phân biệt mã hoá vs hash

- **Mật khẩu người dùng:** Dùng `bcrypt` (one-way hash) — không thể phục hồi, chỉ so sánh.
- **Access token:** Dùng `pgp_sym_encrypt` (two-way) — cần phục hồi để gọi API.

---

## 9. Naming Conventions

### 9.1 Tên bảng
- Dùng `snake_case`, số ít (singular): `social_account`, không phải `social_accounts`.
- Bảng metric theo ngày có hậu tố `_daily`: `account_metric_daily`.
- Bảng log có hậu tố `_log`: `api_sync_log`.
- Bảng trung gian n-n dùng tên ghép: `social_account_member`.

### 9.2 Tên cột
- `id` — Primary key UUID trên mọi bảng.
- `*_id` — Foreign key, tên bảng tham chiếu + `_id`: `account_id`, `post_id`.
- `*_at` — Timestamp: `created_at`, `updated_at`, `published_at`, `started_at`.
- `*_encrypted` — Cột lưu dữ liệu đã mã hoá: `access_token_encrypted`, `value_encrypted`.
- `*_micros` — Giá trị tiền tệ nhân 1000: `spend_micros`, `revenue_micros`.
- `*_vnd` — Giá trị tiền tệ thực tế VND: `amount_vnd`, `revenue_vnd`.
- `is_*` — Boolean flag: `is_manual`.
- `raw_*` — Dữ liệu thô chưa xử lý: `raw_metrics`.

### 9.3 Tên ENUM type
- Hậu tố `_t` (type): `platform_t`, `severity_t`, `sync_type_t`.

### 9.4 Tên index
- Pattern: `idx_{tên_bảng}_{cột_chính}[_{cột_phụ}]`
- Ví dụ: `idx_account_metric_daily_account_date`, `idx_alert_unread`.

### 9.5 Tên constraint
- Pattern: `{tên_bảng}_{cột}_{loại}` hoặc UNIQUE constraint đặt ngay trong CREATE TABLE.

---

## 10. Migration Strategy

### 10.1 Công cụ

Dự án sử dụng **node-pg-migrate** để quản lý schema evolution:

```bash
# Chạy migration
npm run db:migrate up

# Rollback 1 migration
npm run db:migrate down 1

# Tạo migration mới
npm run db:migrate create ten-migration
```

### 10.2 Naming convention cho file migration

```
{YYYYMMDDHHmmss}_{ten-migration}.js
```

Ví dụ:
```
20240115103000_create-social-account.js
20240120090000_add-bundle-team-id-to-member.js
20240201143000_add-ads-ingestion-to-sync-type.js
```

- Timestamp đảm bảo thứ tự chạy migration đúng.
- Tên migration mô tả hành động rõ ràng: `create-`, `add-`, `alter-`, `drop-`, `rename-`.

### 10.3 Hiện trạng

Dự án hiện có **55 migrations**, bao gồm toàn bộ lịch sử phát triển schema từ khởi tạo đến tính năng mới nhất (ads_ingestion, bundle_import).

### 10.4 Nguyên tắc viết migration

**Mỗi migration phải có cả `up` và `down`:**

```js
// 20240115103000_create-social-account.js
exports.up = (pgm) => {
  pgm.createTable('social_account', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    platform: { type: 'platform_t', notNull: true },
    // ...
  });
};

exports.down = (pgm) => {
  pgm.dropTable('social_account');
};
```

**Quy tắc an toàn:**
- Không bao giờ DROP cột trực tiếp trên production — đánh dấu deprecated, sau N sprint mới drop.
- Thêm cột mới phải có DEFAULT hoặc NULLABLE để tránh lock bảng lớn.
- Migration thêm index nên dùng `CREATE INDEX CONCURRENTLY` để không block đọc/ghi.
- Tất cả migration phải chạy được trong transaction (node-pg-migrate thực hiện điều này mặc định).

### 10.5 Quy trình deploy

```
1. Code review migration file
2. Chạy migration trên môi trường staging
3. Kiểm tra dữ liệu staging
4. Deploy API code mới (tương thích cả schema cũ và mới)
5. Chạy migration trên production
6. Xác nhận tính toàn vẹn dữ liệu
```

---

*Tài liệu này được tạo tự động từ schema thực tế của Marketing OS. Cập nhật khi có thay đổi schema quan trọng.*
