# ĐẶC TẢ YÊU CẦU HỆ THỐNG (SRS)
## Marketing OS — Hệ thống Quản lý Marketing Đa kênh

| Thông tin | Nội dung |
|---|---|
| **Phiên bản** | 1.0 |
| **Ngày tạo** | 2026-07-22 |
| **Trạng thái** | Draft |
| **Chuẩn áp dụng** | IEEE 830-1998 |
| **Ngôn ngữ** | Tiếng Việt |

---

## MỤC LỤC

1. [Giới thiệu](#1-giới-thiệu)
2. [Mô tả tổng quan hệ thống](#2-mô-tả-tổng-quan-hệ-thống)
3. [Yêu cầu chức năng](#3-yêu-cầu-chức-năng)
4. [Yêu cầu phi chức năng](#4-yêu-cầu-phi-chức-năng)
5. [Ràng buộc hệ thống](#5-ràng-buộc-hệ-thống)
6. [Giả định và phụ thuộc](#6-giả-định-và-phụ-thuộc)

---

## 1. GIỚI THIỆU

### 1.1 Mục đích tài liệu

Tài liệu này đặc tả đầy đủ các yêu cầu chức năng và phi chức năng của hệ thống **Marketing OS** — một nền tảng quản lý marketing đa kênh dành cho doanh nghiệp Việt Nam. Tài liệu phục vụ cho các đối tượng:

- **Đội phát triển (Developer/DevOps):** Làm cơ sở thiết kế kiến trúc và triển khai tính năng.
- **Đội kiểm thử (QA/Tester):** Xây dựng test case, kiểm tra nghiệm thu.
- **Quản lý dự án (PM):** Lập kế hoạch, phân công và theo dõi tiến độ.
- **Khách hàng / Stakeholder:** Xác nhận và phê duyệt phạm vi sản phẩm.

### 1.2 Phạm vi hệ thống

**Marketing OS** là một web application hỗ trợ team marketing:

- Tổng hợp dữ liệu từ các kênh truyền thông xã hội (Facebook, TikTok, YouTube, Instagram, LinkedIn, v.v.) vào một dashboard duy nhất.
- Theo dõi hiệu quả quảng cáo (Facebook Ads, Google Ads, TikTok Ads) theo thời gian thực.
- Quản lý nội dung (brief, workflow duyệt bài).
- Hỗ trợ ra quyết định bằng AI (tích hợp Claude, GPT, Gemini, Grok qua OpenRouter).
- Gửi báo cáo tự động qua Telegram.
- Cung cấp MCP Server cho phép tích hợp với Claude Desktop/Cursor.

Hệ thống **không bao gồm** chức năng đăng bài trực tiếp lên mạng xã hội hoặc quản lý CRM khách hàng.

### 1.3 Định nghĩa và từ viết tắt

| Thuật ngữ | Định nghĩa |
|---|---|
| **KPI** | Key Performance Indicator — chỉ số hiệu suất chính |
| **CPA** | Cost Per Acquisition — chi phí trên mỗi chuyển đổi |
| **ROAS** | Return On Ad Spend — doanh thu trên chi phí quảng cáo |
| **GA4** | Google Analytics 4 |
| **MCP** | Model Context Protocol — giao thức tích hợp AI của Anthropic |
| **RSS** | Really Simple Syndication — định dạng cấp tin tức |
| **SRS** | Software Requirements Specification |
| **FR** | Functional Requirement — yêu cầu chức năng |
| **NFR** | Non-Functional Requirement — yêu cầu phi chức năng |
| **Admin** | Vai trò quản trị viên hệ thống |
| **Member** | Vai trò thành viên team marketing |

### 1.4 Tài liệu tham chiếu

| STT | Tài liệu | Nguồn |
|---|---|---|
| [1] | IEEE Std 830-1998: Recommended Practice for Software Requirements Specifications | IEEE |
| [2] | Facebook Graph API v25.0 Documentation | Meta Developers |
| [3] | Google Analytics Data API v1 | Google |
| [4] | OpenRouter API Documentation | openrouter.ai |
| [5] | Telegram Bot API | telegram.org |
| [6] | Model Context Protocol Specification | Anthropic |
| [7] | Next.js 15 App Router Documentation | Vercel |

---

## 2. MÔ TẢ TỔNG QUAN HỆ THỐNG

### 2.1 Bối cảnh sản phẩm

Các doanh nghiệp Việt Nam hiện nay phải vận hành đồng thời nhiều kênh marketing (Facebook, TikTok, Google, Zalo...) với dữ liệu phân tán trên nhiều nền tảng khác nhau. Marketing OS ra đời nhằm hợp nhất toàn bộ dữ liệu, tự động hóa báo cáo và tăng tốc quá trình ra quyết định bằng AI.

```
[Nền tảng ngoài]          [Marketing OS]            [Người dùng]
Facebook API    ──────►  ┌─────────────────┐  ◄────  Admin
TikTok API      ──────►  │   Dashboard KPI  │  ◄────  Team Member
Google Ads API  ──────►  │   AI Tools       │
GA4 API         ──────►  │   Báo cáo Auto   │  ──►   Telegram Bot
Telegram API    ◄──────  │   MCP Server     │  ──►   Claude Desktop
```

### 2.2 Chức năng tổng quan

Hệ thống gồm 12 nhóm chức năng chính:

| STT | Module | Mô tả ngắn |
|---|---|---|
| 1 | Dashboard KPI | Tổng hợp chỉ số reach, leads, engagement, followers, conversions |
| 2 | Quản lý kênh | Kết nối và đồng bộ 11 mạng xã hội |
| 3 | Quảng cáo | Theo dõi spend, CPA, ROAS cho 3 nền tảng ads |
| 4 | Landing Page Analytics | Dữ liệu từ GA4, Google Sheets, Ladipage |
| 5 | Inbox/Messenger | Số liệu tin nhắn và phản hồi |
| 6 | Brief nội dung | Workflow quản lý brief từ draft đến publish |
| 7 | Thư viện kỹ năng AI | Upload file, hỏi đáp AI |
| 8 | Projects AI | Workspace AI với knowledge files |
| 9 | Tin tức marketing | RSS + Apify monitoring xu hướng |
| 10 | Báo cáo Telegram | Gửi tự động 07:00 VN + Q&A bot |
| 11 | Quản lý team | Phân quyền, KPI theo thành viên |
| 12 | MCP Server | API tích hợp Claude Desktop/Cursor |

### 2.3 Người dùng hệ thống

#### 2.3.1 Admin

- Quản lý toàn bộ hệ thống, cấu hình tích hợp API bên ngoài.
- Thêm/xóa/phân quyền thành viên team.
- Nhập liệu thủ công cho các kênh chưa có API.
- Cấu hình lịch chạy cron jobs, Telegram bot.
- Xem tất cả dữ liệu, báo cáo, logs.

#### 2.3.2 Team Member

- Xem dashboard và báo cáo KPI (theo phân quyền).
- Tạo, chỉnh sửa brief nội dung.
- Sử dụng thư viện kỹ năng AI và Projects AI.
- Không thể thay đổi cấu hình hệ thống hoặc tích hợp.

### 2.4 Môi trường vận hành

- **Nền tảng:** Web application, truy cập qua trình duyệt (Chrome, Firefox, Edge).
- **Triển khai:** Docker container (standalone output), hỗ trợ Docker Compose.
- **Múi giờ:** Asia/Ho_Chi_Minh (UTC+7) cho tất cả dữ liệu hiển thị và lên lịch.
- **Ngôn ngữ giao diện:** Tiếng Việt.

---

## 3. YÊU CẦU CHỨC NĂNG

> **Quy ước mức ưu tiên:**
> - **P1 — Bắt buộc:** Phải có trong phiên bản đầu tiên.
> - **P2 — Quan trọng:** Cần có, có thể trì hoãn sang sprint tiếp theo.
> - **P3 — Tốt có:** Tính năng nâng cao, tùy chọn.

---

### 3.1 Module: Xác thực & Phân quyền (AUTH)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-AUTH-01 | Hệ thống cho phép đăng nhập bằng email và mật khẩu. | P1 |
| FR-AUTH-02 | Mật khẩu được mã hóa bằng bcryptjs trước khi lưu vào CSDL. | P1 |
| FR-AUTH-03 | Session được duy trì qua encrypted cookie, hết hạn sau 7 ngày. | P1 |
| FR-AUTH-04 | Hệ thống giới hạn số lần đăng nhập sai (brute force protection). | P1 |
| FR-AUTH-05 | Phân quyền hai cấp: Admin và Member. Admin có toàn quyền; Member bị giới hạn theo cấu hình. | P1 |
| FR-AUTH-06 | Admin có thể tạo, chỉnh sửa, vô hiệu hóa tài khoản thành viên. | P1 |

---

### 3.2 Module: Dashboard KPI (DASH)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-DASH-01 | Dashboard hiển thị tổng hợp KPI: Reach, Leads, Engagement Rate, Followers, Conversions theo ngày/tuần/tháng. | P1 |
| FR-DASH-02 | Dữ liệu KPI được tổng hợp từ nhiều kênh và hiển thị trên một màn hình duy nhất. | P1 |
| FR-DASH-03 | Biểu đồ xu hướng (line chart, bar chart) cho các chỉ số quan trọng. | P1 |
| FR-DASH-04 | Người dùng có thể lọc dữ liệu theo khoảng thời gian tùy chọn. | P1 |
| FR-DASH-05 | Hiển thị tăng/giảm so với kỳ trước (% change) cho từng KPI. | P2 |
| FR-DASH-06 | Dashboard tự động làm mới dữ liệu theo chu kỳ cron jobs. | P1 |

---

### 3.3 Module: Quản lý kênh mạng xã hội (CHAN)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-CHAN-01 | Hỗ trợ kết nối 11 mạng xã hội: Facebook, TikTok, YouTube, Instagram, LinkedIn, Twitter/X, Pinterest, Reddit, Mastodon, Bluesky, Zalo. | P1 |
| FR-CHAN-02 | Admin nhập Access Token / API Key để kết nối từng kênh. | P1 |
| FR-CHAN-03 | Hệ thống hiển thị Page ID và Token (có tùy chọn ẩn/hiện và copy) trong chi tiết kênh. | P1 |
| FR-CHAN-04 | Cron job tự động đồng bộ page insights hàng ngày (reach, followers, engagement). | P1 |
| FR-CHAN-05 | Tự động cập nhật tên page từ Facebook API khi đồng bộ. | P1 |
| FR-CHAN-06 | Hỗ trợ tích hợp Bundle.social để quản lý đa kênh. | P2 |
| FR-CHAN-07 | Admin có thể kích hoạt hoặc vô hiệu hóa từng kênh. | P1 |
| FR-CHAN-08 | Nhập liệu thủ công cho các kênh chưa có API (Zalo, Pinterest, v.v.). | P2 |

---

### 3.4 Module: Quản lý quảng cáo (ADS)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-ADS-01 | Tích hợp Facebook Ads API để lấy dữ liệu campaign: spend, impressions, clicks, CPM, CPC, CPA, ROAS. | P1 |
| FR-ADS-02 | Tích hợp Google Ads API để lấy dữ liệu tương tự. | P1 |
| FR-ADS-03 | Tích hợp TikTok Ads API. | P2 |
| FR-ADS-04 | Hiển thị tất cả campaigns với cột: Tên, Spend, Conversions, CPA, ROAS. | P1 |
| FR-ADS-05 | Biểu đồ Conversions được bật mặc định trên chart ads. | P1 |
| FR-ADS-06 | Cron job tự động cập nhật dữ liệu ads theo chu kỳ cấu hình. | P1 |
| FR-ADS-07 | Lọc dữ liệu ads theo khoảng thời gian, platform, campaign. | P2 |

---

### 3.5 Module: Landing Page Analytics (LP)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-LP-01 | Tích hợp Google Analytics 4 API để lấy số liệu: sessions, users, bounce rate, conversion rate. | P1 |
| FR-LP-02 | Tích hợp Google Sheets để nhập dữ liệu thủ công hoặc tổng hợp. | P2 |
| FR-LP-03 | Tích hợp Ladipage để theo dõi tỷ lệ chuyển đổi landing page. | P2 |
| FR-LP-04 | Hiển thị danh sách landing pages với KPI tương ứng. | P1 |
| FR-LP-05 | So sánh hiệu quả giữa các landing pages. | P2 |

---

### 3.6 Module: Inbox / Messenger (INBOX)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-INBOX-01 | Hiển thị số liệu inbox: tổng tin nhắn nhận, đã trả lời, thời gian phản hồi trung bình. | P1 |
| FR-INBOX-02 | Dữ liệu inbox lấy từ Facebook Messenger API. | P1 |
| FR-INBOX-03 | Nhập thủ công cho các kênh inbox chưa có API. | P2 |

---

### 3.7 Module: Brief nội dung (BRIEF)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-BRIEF-01 | Tạo brief nội dung với các trường: tiêu đề, mô tả, kênh đăng, ngày dự kiến, người phụ trách, trạng thái. | P1 |
| FR-BRIEF-02 | Workflow trạng thái: Draft → Review → Approved → Published / Rejected. | P1 |
| FR-BRIEF-03 | Thành viên tạo brief; Admin/người được phân quyền duyệt brief. | P1 |
| FR-BRIEF-04 | Gửi thông báo khi brief được duyệt hoặc từ chối. | P2 |
| FR-BRIEF-05 | Lọc và tìm kiếm brief theo trạng thái, kênh, người phụ trách, khoảng thời gian. | P1 |
| FR-BRIEF-06 | Gắn file đính kèm (hình ảnh, tài liệu) vào brief. | P2 |

---

### 3.8 Module: Thư viện kỹ năng AI (SKILLS)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-SKILL-01 | Admin upload file (PDF, DOCX, TXT) làm tài liệu tham chiếu cho AI. | P1 |
| FR-SKILL-02 | Người dùng chat với AI sử dụng context từ file đã upload. | P1 |
| FR-SKILL-03 | Chọn model AI: Claude, GPT, Gemini, Grok (qua OpenRouter). | P1 |
| FR-SKILL-04 | Lưu lịch sử hội thoại trong phiên làm việc. | P1 |
| FR-SKILL-05 | Admin có thể quản lý (thêm/xóa/cập nhật) danh sách kỹ năng. | P1 |

---

### 3.9 Module: Projects AI (PROJ)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-PROJ-01 | Tạo project workspace với tên, mô tả, danh sách thành viên. | P1 |
| FR-PROJ-02 | Upload nhiều knowledge files vào project. | P1 |
| FR-PROJ-03 | Chat AI trong ngữ cảnh project (AI dùng toàn bộ knowledge files làm context). | P1 |
| FR-PROJ-04 | Lưu lịch sử hội thoại của project. | P1 |
| FR-PROJ-05 | Nhiều thành viên cùng truy cập một project. | P2 |

---

### 3.10 Module: Tin tức Marketing (NEWS)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-NEWS-01 | Cron job thu thập tin tức từ RSS feeds marketing định kỳ. | P1 |
| FR-NEWS-02 | Tích hợp Apify để scrape tin tức từ các nguồn không có RSS. | P2 |
| FR-NEWS-03 | Hiển thị danh sách tin theo thứ tự thời gian, có phân trang. | P1 |
| FR-NEWS-04 | Lọc tin theo nguồn, chủ đề. | P2 |
| FR-NEWS-05 | Admin cấu hình danh sách nguồn RSS và URL theo dõi. | P1 |

---

### 3.11 Module: Báo cáo Telegram (TELE)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-TELE-01 | Cron job tự động gửi báo cáo KPI hàng ngày lúc 07:00 (Asia/Ho_Chi_Minh) qua Telegram Bot. | P1 |
| FR-TELE-02 | Báo cáo bao gồm: tổng reach, tổng spend, leads, conversions, so sánh với ngày hôm trước. | P1 |
| FR-TELE-03 | Bot Telegram hỗ trợ Q&A: người dùng hỏi trong chat, bot trả lời bằng AI với dữ liệu thực tế. | P2 |
| FR-TELE-04 | Admin cấu hình Telegram Bot Token và Chat ID trong giao diện Settings. | P1 |
| FR-TELE-05 | Ghi log mỗi lần gửi báo cáo (thành công / lỗi). | P1 |

---

### 3.12 Module: Quản lý Team (TEAM)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-TEAM-01 | Admin xem danh sách toàn bộ thành viên với email, vai trò, ngày tham gia. | P1 |
| FR-TEAM-02 | Admin thiết lập KPI mục tiêu theo từng thành viên (reach, leads, content count...). | P2 |
| FR-TEAM-03 | Hiển thị tiến độ hoàn thành KPI của từng thành viên. | P2 |
| FR-TEAM-04 | Admin cấp quyền truy cập cụ thể (kênh nào, module nào) cho từng Member. | P2 |

---

### 3.13 Module: MCP Server (MCP)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-MCP-01 | Hệ thống expose MCP Server endpoint cho phép Claude Desktop/Cursor kết nối. | P1 |
| FR-MCP-02 | MCP Server cung cấp tools: lấy KPI dashboard, dữ liệu ads, thông tin kênh, brief nội dung. | P1 |
| FR-MCP-03 | Xác thực kết nối MCP bằng API key (Admin cấp phát). | P1 |
| FR-MCP-04 | Ghi log các truy vấn qua MCP Server. | P2 |

---

### 3.14 Module: Cấu hình hệ thống (SETTINGS)

| ID | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-SET-01 | Admin quản lý toàn bộ API keys và tokens tích hợp trong trang Settings. | P1 |
| FR-SET-02 | Tokens được mã hóa bằng pgcrypto AES trước khi lưu vào CSDL. | P1 |
| FR-SET-03 | Xem log cron jobs (lịch sử chạy, trạng thái, lỗi nếu có). | P1 |
| FR-SET-04 | Admin kích hoạt/tắt từng cron job thủ công (run-job). | P1 |

---

## 4. YÊU CẦU PHI CHỨC NĂNG

### 4.1 Hiệu năng (Performance)

| ID | Yêu cầu | Chỉ tiêu |
|---|---|---|
| NFR-PERF-01 | Thời gian tải trang dashboard | ≤ 3 giây (kết nối thông thường) |
| NFR-PERF-02 | Thời gian phản hồi API nội bộ | ≤ 500ms cho 95% request |
| NFR-PERF-03 | Cron job đồng bộ dữ liệu hàng ngày | Hoàn thành trong vòng 10 phút |
| NFR-PERF-04 | Hỗ trợ đồng thời | Tối thiểu 50 người dùng cùng lúc |
| NFR-PERF-05 | Kích thước file upload (Skills, Projects) | Tối đa 20MB mỗi file |

### 4.2 Bảo mật (Security)

| ID | Yêu cầu | Mô tả |
|---|---|---|
| NFR-SEC-01 | Mã hóa mật khẩu | bcryptjs, salt rounds ≥ 10 |
| NFR-SEC-02 | Mã hóa API tokens | pgcrypto AES-256 trong PostgreSQL |
| NFR-SEC-03 | Session bảo mật | Encrypted cookie (iron-session), TTL 7 ngày |
| NFR-SEC-04 | Chống brute force | Rate limiting đăng nhập: tối đa 5 lần sai / 15 phút / IP |
| NFR-SEC-05 | HTTPS | Toàn bộ traffic phải qua HTTPS (nginx SSL termination) |
| NFR-SEC-06 | Phân quyền API | Mọi API endpoint phải kiểm tra session và role |
| NFR-SEC-07 | Input validation | Validate và sanitize toàn bộ input người dùng (chống SQL injection, XSS) |
| NFR-SEC-08 | Audit log | Ghi lại các thao tác quan trọng: đăng nhập, thay đổi cấu hình, xóa dữ liệu |

### 4.3 Độ tin cậy (Reliability)

| ID | Yêu cầu | Chỉ tiêu |
|---|---|---|
| NFR-REL-01 | Uptime | ≥ 99% (không bao gồm bảo trì có kế hoạch) |
| NFR-REL-02 | Cron job tự phục hồi | Tự retry khi cron job thất bại (tối đa 3 lần) |
| NFR-REL-03 | Ghi log lỗi | Mọi lỗi runtime phải được ghi log với timestamp, context |
| NFR-REL-04 | Backup CSDL | Backup PostgreSQL định kỳ hàng ngày |

### 4.4 Khả năng mở rộng (Scalability)

| ID | Yêu cầu | Mô tả |
|---|---|---|
| NFR-SCALE-01 | Kiến trúc module hóa | Các module độc lập, có thể thêm kênh mới mà không ảnh hưởng module khác |
| NFR-SCALE-02 | Thêm AI model | Hỗ trợ thêm model mới qua OpenRouter mà không cần thay đổi code lõi |
| NFR-SCALE-03 | Container hóa | Triển khai bằng Docker, dễ scale theo chiều ngang |
| NFR-SCALE-04 | Cấu hình cron | Admin có thể thêm/bật/tắt cron jobs qua giao diện |

### 4.5 Khả năng bảo trì (Maintainability)

| ID | Yêu cầu | Mô tả |
|---|---|---|
| NFR-MAINT-01 | Codebase | TypeScript strict mode, chuẩn ESLint |
| NFR-MAINT-02 | Schema migration | Quản lý database migration có version |
| NFR-MAINT-03 | Môi trường | Hỗ trợ `.env` cấu hình riêng cho dev/staging/production |
| NFR-MAINT-04 | Log cron | Xem lịch sử và kết quả chạy của từng cron job trong giao diện |

### 4.6 Khả năng sử dụng (Usability)

| ID | Yêu cầu | Mô tả |
|---|---|---|
| NFR-UX-01 | Ngôn ngữ giao diện | Tiếng Việt là ngôn ngữ mặc định và duy nhất |
| NFR-UX-02 | Responsive | Giao diện tương thích desktop (1280px+); mobile là tùy chọn |
| NFR-UX-03 | Thời gian làm quen | Admin mới có thể sử dụng tính năng cơ bản sau ≤ 30 phút hướng dẫn |
| NFR-UX-04 | Thông báo lỗi | Hiển thị thông báo lỗi rõ ràng, gợi ý hành động khắc phục |

---

## 5. RÀNG BUỘC HỆ THỐNG

### 5.1 Ràng buộc kỹ thuật

| STT | Ràng buộc | Chi tiết |
|---|---|---|
| C-TECH-01 | Framework | Next.js 15+ (App Router), React 19, TypeScript |
| C-TECH-02 | CSDL | PostgreSQL 14+ |
| C-TECH-03 | UI Library | Tailwind CSS 4, shadcn/ui |
| C-TECH-04 | Lên lịch | node-cron (tối thiểu 13 jobs đã định nghĩa) |
| C-TECH-05 | AI Gateway | OpenRouter API (không gọi trực tiếp từng provider) |
| C-TECH-06 | Đóng gói | Docker standalone output; hỗ trợ Docker Compose |
| C-TECH-07 | Proxy | Nginx làm reverse proxy và SSL termination |

### 5.2 Ràng buộc nghiệp vụ

| STT | Ràng buộc | Chi tiết |
|---|---|---|
| C-BIZ-01 | Múi giờ | Tất cả dữ liệu thời gian lưu UTC, hiển thị theo Asia/Ho_Chi_Minh (UTC+7) |
| C-BIZ-02 | Facebook API | Sử dụng Graph API v25.0; token cần đủ permission: `pages_read_engagement`, `ads_read` |
| C-BIZ-03 | Giới hạn API | Tuân thủ rate limits của từng nền tảng (Facebook, Google, TikTok) |
| C-BIZ-04 | Dữ liệu cá nhân | Không lưu trữ nội dung tin nhắn của end-user, chỉ lưu số liệu thống kê |

### 5.3 Ràng buộc pháp lý & tuân thủ

| STT | Ràng buộc | Chi tiết |
|---|---|---|
| C-LEGAL-01 | Terms of Service | Tuân thủ ToS của Facebook, Google, TikTok khi dùng API |
| C-LEGAL-02 | Dữ liệu người dùng | Không chia sẻ dữ liệu platform với bên thứ ba ngoài danh sách tích hợp |

---

## 6. GIẢ ĐỊNH VÀ PHỤ THUỘC

### 6.1 Giả định

| STT | Giả định |
|---|---|
| A-01 | Doanh nghiệp đã có tài khoản Facebook Business Manager với quyền truy cập API. |
| A-02 | Doanh nghiệp đã có Google Cloud project với GA4 API và Google Ads API được kích hoạt. |
| A-03 | Hệ thống được triển khai trên server Linux có cài đặt Docker. |
| A-04 | Người dùng có kết nối internet ổn định để tải dashboard và sử dụng AI. |
| A-05 | Admin có kiến thức kỹ thuật cơ bản để thiết lập API keys và tokens. |
| A-06 | OpenRouter duy trì khả năng phục vụ các model Claude, GPT-4, Gemini, Grok. |
| A-07 | Telegram Bot API miễn phí và ổn định cho nhu cầu gửi báo cáo hàng ngày. |

### 6.2 Phụ thuộc bên ngoài

| STT | Dịch vụ | Mức độ phụ thuộc | Rủi ro nếu mất |
|---|---|---|---|
| D-01 | Facebook Graph API v25.0 | Cao | Mất đồng bộ dữ liệu Facebook/Instagram |
| D-02 | Google Analytics 4 API | Cao | Mất dữ liệu landing page |
| D-03 | OpenRouter API | Cao | Mất toàn bộ tính năng AI |
| D-04 | Telegram Bot API | Trung bình | Mất báo cáo tự động |
| D-05 | Bundle.social | Trung bình | Mất đồng bộ đa kênh |
| D-06 | Apify | Thấp | Mất thu thập tin tức từ nguồn không có RSS |
| D-07 | Ladipage API | Thấp | Mất dữ liệu từ landing pages Ladipage |
| D-08 | Lark/Feishu API | Thấp | Mất tích hợp Lark Base |

### 6.3 Phụ thuộc nội bộ

| STT | Phụ thuộc |
|---|---|
| D-INT-01 | PostgreSQL phải hoạt động trước khi khởi động ứng dụng Next.js. |
| D-INT-02 | Biến môi trường (`.env`) phải được cấu hình đúng trước khi build Docker image. |
| D-INT-03 | Database migration phải chạy thành công trước khi sử dụng hệ thống. |
| D-INT-04 | File pgcrypto extension phải được kích hoạt trong PostgreSQL để mã hóa tokens. |

---

## PHỤ LỤC: DANH SÁCH CRON JOBS

| STT | Job | Lịch | Mô tả |
|---|---|---|---|
| 1 | page_insights_daily | Hàng ngày 01:00 VN | Đồng bộ page insights từ Facebook |
| 2 | ads_ingestion | Hàng ngày 02:00 VN | Lấy dữ liệu ads mới nhất |
| 3 | ga4_sync | Hàng ngày 02:30 VN | Đồng bộ dữ liệu GA4 |
| 4 | news_feed | Mỗi 4 giờ | Thu thập RSS feeds |
| 5 | telegram_report | Hàng ngày 07:00 VN | Gửi báo cáo sáng |
| 6 | bundle_sync | Hàng ngày 03:00 VN | Đồng bộ Bundle.social |
| ... | *(13 jobs tổng cộng)* | | |

---

*Tài liệu này được tạo bởi Claude Code (claude-sonnet-4-6) dựa trên phân tích codebase Marketing OS tại `/home/taki/Downloads/soida/marketing-os/`.*

*Phiên bản tiếp theo sẽ cập nhật khi có thay đổi kiến trúc hoặc tính năng mới.*
