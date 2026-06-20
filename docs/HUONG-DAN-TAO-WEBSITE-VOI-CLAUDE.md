# Hướng dẫn: Dùng Claude tạo một website như Marketing OS (cho người mới)

Tài liệu này dành cho **người chưa biết lập trình** (hoặc biết rất ít) muốn dùng
**Claude Code** để tự xây một website quản lý tương tự Marketing OS. Bạn không cần
viết code — bạn ra lệnh, Claude viết; bạn kiểm tra, phản hồi, lặp lại.

> Triết lý: **Bạn là người chỉ đạo, Claude là thợ.** Việc của bạn là mô tả rõ
> muốn gì, chạy thử, và nói cho Claude biết chỗ nào chưa đúng. Càng mô tả rõ,
> kết quả càng tốt.

---

## Mục lục

1. [Bạn sẽ xây cái gì](#1-bạn-sẽ-xây-cái-gì)
2. [Chuẩn bị máy tính (1 lần)](#2-chuẩn-bị-máy-tính-1-lần)
3. [Cách làm việc với Claude Code](#3-cách-làm-việc-với-claude-code)
4. [Xây website từ số 0 — theo từng chặng](#4-xây-website-từ-số-0--theo-từng-chặng)
5. [Ví dụ thực tế: thêm tính năng "Quét FB Ads"](#5-ví-dụ-thực-tế-thêm-tính-năng-quét-fb-ads)
6. [Đưa website lên mạng (deploy)](#6-đưa-website-lên-mạng-deploy)
7. [Mẹo & xử lý lỗi với Claude](#7-mẹo--xử-lý-lỗi-với-claude)
8. [Bảng prompt mẫu tra nhanh](#8-bảng-prompt-mẫu-tra-nhanh)

---

## 1. Bạn sẽ xây cái gì

Marketing OS là một **web app quản lý marketing nội bộ**. Các phần chính:

- **Đăng nhập** (bảo mật bằng mật khẩu mã hoá)
- **Dashboard**: số liệu tổng quan, biểu đồ
- **Quản lý kênh** social (Facebook, TikTok…)
- **Tin tức**: tự động lấy tin từ nguồn ngoài
- **Doanh thu, content brief, thư viện…**
- **Job nền (cron)**: tự động chạy theo lịch (vd mỗi giờ lấy tin)

Công nghệ dùng (Claude sẽ lo, bạn chỉ cần biết tên):

| Lớp | Công nghệ | Vai trò |
|-----|-----------|---------|
| Giao diện + máy chủ | **Next.js** (React) | Vừa làm web, vừa làm API |
| Giao diện đẹp | **Tailwind CSS** + **shadcn/ui** | Style sẵn, gọn |
| Cơ sở dữ liệu | **PostgreSQL** | Lưu dữ liệu |
| Chạy DB dễ dàng | **Docker** | Bật Postgres bằng 1 lệnh |
| Đăng nhập | **iron-session** | Quản lý phiên đăng nhập |

> Bạn **không cần hiểu sâu** các thứ này. Cứ để nguyên stack này vì nó phổ biến,
> Claude rất thạo, và có sẵn dự án Marketing OS làm mẫu.

---

## 2. Chuẩn bị máy tính (1 lần)

Bạn cần cài 4 thứ. Nếu kẹt bước nào, **hỏi thẳng Claude**: *"Tôi dùng máy
[Windows/Mac], hướng dẫn tôi cài [tên công cụ] từng bước."*

### 2.1 Claude Code
Đây là công cụ chính — Claude chạy ngay trong máy bạn, đọc/sửa file, chạy lệnh.
- Có bản **CLI** (gõ lệnh trong Terminal), **app desktop** (Mac/Windows), và
  **tiện ích cho VS Code**.
- Người mới nên dùng **app desktop** hoặc **VS Code extension** cho dễ nhìn.
- Đăng nhập bằng tài khoản Claude (cần gói có Claude Code).

### 2.2 Node.js (phiên bản 20 trở lên)
Là môi trường chạy Next.js. Tải tại nodejs.org, chọn bản **LTS**.
Kiểm tra sau khi cài: mở Terminal gõ `node -v` → ra số phiên bản là được.

### 2.3 Docker Desktop
Dùng để bật PostgreSQL nhanh mà không phải cài DB phức tạp. Tải tại docker.com.

### 2.4 Git
Để lưu lịch sử code (mỗi lần thay đổi = 1 "commit", lỡ hỏng quay lại được).
Tải tại git-scm.com.

> **Mẹo:** Sau khi cài xong, mở Claude Code và nói:
> *"Kiểm tra giúp tôi đã cài đúng Node, Docker, Git chưa — chạy các lệnh kiểm tra
> và báo kết quả."* Claude sẽ tự chạy `node -v`, `docker --version`, `git --version`.

---

## 3. Cách làm việc với Claude Code

Đây là phần **quan trọng nhất**. Làm đúng cách thì người mới vẫn ra sản phẩm tốt.

### Nguyên tắc 1 — Ra lệnh rõ ràng, có ngữ cảnh
❌ Tệ: *"Làm trang quản lý đi."*
✅ Tốt: *"Tạo trang `/news` hiển thị danh sách tin tức dạng thẻ (card), mỗi thẻ
có ảnh, tiêu đề, nguồn, ngày. Dữ liệu lấy từ bảng `news_article` trong DB. Style
giống các trang khác trong dự án."*

### Nguyên tắc 2 — Đi từng bước nhỏ, đừng ôm cả núi
Đừng nói *"xây cho tôi cả website"*. Hãy chia nhỏ: đăng nhập trước → dashboard →
từng tính năng. Mỗi bước **chạy thử** rồi mới sang bước sau. (Phần 4 đã chia sẵn.)

### Nguyên tắc 3 — Dùng "chế độ lập kế hoạch" cho việc lớn
Với tính năng phức tạp, nói: *"Trước khi code, hãy lập kế hoạch và cho tôi xem
các bước bạn định làm."* Claude sẽ trình bày kế hoạch để bạn duyệt trước khi nó
sửa file. Tránh được việc nó làm sai hướng rồi phải đập đi.

### Nguyên tắc 4 — Luôn yêu cầu Claude tự kiểm tra
Sau khi Claude viết xong, nói: *"Chạy build/kiểm tra type xem có lỗi không, rồi
mở thử app."* Claude có thể tự chạy `npm run build`, bắt lỗi và sửa. **Đừng tin
là xong cho tới khi nó chạy thật.**

### Nguyên tắc 5 — Phản hồi cụ thể khi sai
❌ *"Vẫn lỗi."*
✅ *"Bấm nút Scan thì hiện chữ đỏ 'Unauthorized'. Đây là ảnh chụp màn hình /
đoạn log. Sửa giúp."* Dán **thông báo lỗi nguyên văn** — Claude sửa nhanh hơn nhiều.

### Nguyên tắc 6 — Lưu thường xuyên (commit)
Mỗi khi một tính năng chạy ổn, nói: *"Commit lại với mô tả ngắn gọn."* Như vậy
lỡ bước sau hỏng, bạn nói *"quay lại commit trước"* là an toàn.

### Nguyên tắc 7 — Hỏi khi không hiểu
Claude là cả thợ lẫn thầy. Bất cứ lúc nào rối: *"Giải thích cho tôi như giải
thích cho người không biết code: cái [X] này là gì, để làm gì?"*

---

## 4. Xây website từ số 0 — theo từng chặng

Dưới đây là lộ trình + **prompt mẫu** bạn copy-paste cho Claude (sửa lại cho hợp
nhu cầu của bạn). Làm tuần tự từ trên xuống.

> Trước khi bắt đầu, tạo một thư mục trống cho dự án (vd `my-marketing-os`), mở
> Claude Code **trong thư mục đó**.

### Chặng 0 — Khơi mào & định hướng
```
Tôi muốn xây một web app quản lý marketing nội bộ, tương tự dự án "Marketing OS".
Stack: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + PostgreSQL
(chạy bằng Docker) + đăng nhập bằng iron-session.

Tôi là người mới, gần như không biết code. Hãy:
1) Giải thích ngắn gọn ta sẽ làm theo những chặng nào.
2) Bắt đầu bằng việc khởi tạo dự án Next.js trong thư mục hiện tại.
Đi từng bước, mỗi bước dừng lại cho tôi chạy thử trước khi sang bước sau.
```

### Chặng 1 — Khởi tạo dự án + chạy thử trang trắng
```
Khởi tạo dự án Next.js mới (TypeScript, App Router, Tailwind). Sau đó hướng dẫn
tôi lệnh để chạy dev server và xác nhận mở được http://localhost:3000.
```
✅ **Nghiệm thu:** mở `localhost:3000` thấy trang mặc định của Next.js.

### Chặng 2 — Cơ sở dữ liệu PostgreSQL bằng Docker
```
Tạo cấu hình Docker Compose để chạy PostgreSQL 16 cho môi trường dev (cổng 5434,
user/password đơn giản). Tạo file .env với DATABASE_URL trỏ đúng vào đó. Thiết lập
hệ thống "migrations" bằng node-pg-migrate để quản lý cấu trúc bảng. Tạo migration
đầu tiên: bảng người dùng cơ bản. Hướng dẫn tôi lệnh bật Postgres và chạy migration.
```
✅ **Nghiệm thu:** `docker compose ... up -d` chạy, `npm run db:migrate` báo thành công.

> **Hiểu nhanh "migration":** là các file mô tả thay đổi cấu trúc DB (tạo bảng,
> thêm cột). Chạy theo thứ tự. Nhờ vậy ai cài lại cũng ra DB y hệt. Mỗi lần cần
> bảng/cột mới, bạn bảo Claude *"tạo migration thêm ..."*.

### Chặng 3 — Đăng nhập (auth)
```
Làm chức năng đăng nhập:
- Trang /login có form email + mật khẩu.
- Mật khẩu lưu dạng hash (bcrypt), KHÔNG lưu thô.
- Dùng iron-session (cookie mã hoá) để giữ phiên.
- Tài khoản admin lấy từ biến môi trường ADMIN_EMAIL + ADMIN_PASSWORD_HASH.
- Chặn các trang nội bộ nếu chưa đăng nhập (chuyển về /login).
Hướng dẫn tôi cách sinh ADMIN_PASSWORD_HASH cho mật khẩu của tôi.
```
✅ **Nghiệm thu:** vào trang nội bộ bị đẩy về `/login`; đăng nhập đúng thì vào được.

### Chặng 4 — Khung giao diện + Dashboard
```
Tạo layout chung cho khu vực đã đăng nhập: thanh bên (sidebar) có các mục
Dashboard, Kênh, Tin tức, Doanh thu. Tạo trang Dashboard với vài thẻ KPI giả
(số liệu mẫu) và 1 biểu đồ đường dùng Recharts. Style sạch, hiện đại, dùng
shadcn/ui.
```
✅ **Nghiệm thu:** thấy sidebar + dashboard có thẻ số và biểu đồ.

### Chặng 5 — Một tính năng CRUD hoàn chỉnh (lấy "Tin tức" làm mẫu)
CRUD = Tạo/Đọc/Sửa/Xoá — khuôn mẫu của hầu hết tính năng.
```
Làm tính năng Tin tức:
- Migration: bảng news_article (id, source, title, link unique, description,
  cover_image, published_at, fetched_at).
- Trang /news đọc DB và hiển thị danh sách thẻ tin, có lọc theo nguồn.
- API + nút "Thêm tin thủ công" để tôi test.
Giải thích luồng dữ liệu: từ DB → server component → giao diện.
```
✅ **Nghiệm thu:** thêm 1 tin → hiện ngay trên `/news`.

### Chặng 6 — Lấy dữ liệu từ nguồn ngoài (tự động)
```
Thêm chức năng tự lấy tin từ vài nguồn RSS (vd TechCrunch, The Verge). Viết hàm
fetch RSS, parse, rồi upsert vào news_article (bỏ qua nếu trùng link). Thêm nút
"Fetch ngay" trên trang /news để chạy thủ công.
```
✅ **Nghiệm thu:** bấm "Fetch ngay" → tin thật xuất hiện.

### Chặng 7 — Job nền chạy theo lịch (cron)
```
Thiết lập cron nền để mỗi giờ tự fetch tin (dùng node-cron, đăng ký trong
instrumentation.ts). Thêm trang xem log để biết job chạy lúc nào, thêm bao nhiêu tin.
```
✅ **Nghiệm thu:** để máy chạy, sau 1 giờ thấy tin mới; trang log ghi nhận.

### Chặng 8 — Kết nối API bên thứ ba (vd Facebook) — nâng cao
```
Tôi muốn kết nối Facebook để lấy số liệu page. Giải thích trước những gì tôi
phải tự làm bên Meta Developer (tạo app, lấy App ID/Secret, quyền). Sau đó làm
phần code OAuth + lưu access token (mã hoá trong DB). Đi từng bước, dừng ở chỗ
cần tôi thao tác trên trang Meta.
```
> Phần này cần bạn thao tác bên ngoài (tạo app Meta). Claude sẽ chỉ rõ chỗ nào
> là việc của bạn, chỗ nào nó tự code.

---

## 5. Ví dụ thực tế: thêm tính năng "Quét FB Ads"

Đây là minh hoạ **quy trình thêm 1 tính năng mới** (chính là tính năng đã có
trong dự án này) — để bạn thấy cách ra lệnh cho Claude từ đầu đến cuối.

**Bối cảnh:** muốn dán link Facebook Ads Library, bấm "Scan", và quảng cáo hiện
trong mục Tin tức.

**Bước 1 — Mô tả nhu cầu, để Claude lên kế hoạch:**
```
Trong mục Tin tức, tôi muốn thêm chức năng: dán link Facebook Ads Library rồi
bấm Scan để quét quảng cáo về hiển thị cùng tin tức. Trước khi code, khảo sát
dự án và đề xuất kế hoạch (cần đổi DB không, thêm API nào, giao diện ra sao).
```

**Bước 2 — Chọn cách lấy dữ liệu (Claude tư vấn 2 hướng):**
- Hướng A: dùng dịch vụ quét trả phí (Apify) — tự động nhưng tốn tiền + cần token.
- Hướng B: làm **tiện ích Chrome (extension)** miễn phí — quét bằng trình duyệt
  của bạn rồi đẩy về web.
```
So sánh giúp tôi 2 hướng (Apify vs Chrome extension) về chi phí, công sức, bảo
trì. Khuyến nghị 1 hướng và giải thích vì sao.
```

**Bước 3 — Yêu cầu làm theo hướng đã chọn:**
```
Làm theo hướng Chrome extension: tạo endpoint nhận dữ liệu ad (xác thực bằng
token bí mật, không dùng cookie đăng nhập) và một extension MV3 có nút Scan.
Lưu ad vào news_article, hiển thị với nhãn "FB Ads". Tự kiểm tra build sau khi xong.
```

**Bước 4 — Nghiệm thu & sửa:**
- Chạy thử theo README extension. Nếu lỗi, dán nguyên văn thông báo cho Claude.
- Khi ổn: *"Commit lại và viết README hướng dẫn dùng extension."*

> Bài học rút ra: **mô tả nhu cầu → để Claude lên kế hoạch → chọn hướng → làm →
> chạy thử → phản hồi cụ thể → commit.** Lặp đúng vòng này cho mọi tính năng.

---

## 6. Đưa website lên mạng (deploy)

Khi chạy ổn ở máy, muốn người khác truy cập qua tên miền:
```
Tôi muốn deploy app lên một VPS Ubuntu để truy cập qua tên miền của tôi. Hãy:
1) Giải thích tổng thể tôi cần gì (VPS, tên miền, ...).
2) Tạo cấu hình Docker Compose production (Postgres + app + Nginx reverse proxy).
3) Hướng dẫn cài SSL miễn phí (Let's Encrypt).
4) Viết file hướng dẫn deploy từng bước (run book) để lần sau tôi tự làm.
Đi chậm, mỗi bước giải thích tôi cần gõ gì trên VPS.
```
> Bạn cần mua sẵn: **1 VPS** (vd Ubuntu trên DigitalOcean/Vultr) và **1 tên
> miền**. Claude lo phần cấu hình; bạn làm theo từng lệnh nó đưa.

Cập nhật code mới sau này:
```
Tôi vừa sửa code ở máy và đẩy lên GitHub. Hướng dẫn tôi cập nhật bản chạy trên
VPS (pull code, build lại, restart) — viết thành các lệnh tôi copy chạy.
```

---

## 7. Mẹo & xử lý lỗi với Claude

- **Gặp lỗi → dán nguyên văn.** Đừng diễn giải lại, copy y hệt đoạn đỏ trong
  Terminal hoặc màn hình. Kèm: *"đây là lỗi, sửa giúp và giải thích vì sao."*
- **Không chạy được app?** Nói: *"App không lên. Tự chạy lệnh kiểm tra (build,
  log) tìm nguyên nhân và sửa."*
- **Sợ Claude làm hỏng file?** Trước việc lớn: *"Commit hiện trạng trước đã, rồi
  mới làm."* Lỡ hỏng: *"Quay lại commit gần nhất."*
- **Claude làm quá nhiều thứ một lúc?** *"Dừng lại. Chỉ làm đúng [X] thôi, đừng
  đụng phần khác."*
- **Không hiểu thuật ngữ?** *"Giải thích [migration / API / cron / token...] cho
  người không biết code, kèm ví dụ trong dự án này."*
- **Muốn an toàn dữ liệu thật:** không bao giờ thử nghiệm trên DB production. Test
  ở DB dev (Docker), khi chắc mới deploy.
- **Bí mật (mật khẩu, token):** để trong file `.env`, **không** commit lên GitHub.
  Hỏi Claude: *"Kiểm tra giúp .env đã được .gitignore chưa."*
- **Đừng ngại lặp.** Phần mềm là viết — sửa — viết lại. Mỗi vòng phản hồi làm sản
  phẩm tốt hơn.

---

## 8. Bảng prompt mẫu tra nhanh

| Tình huống | Câu nói cho Claude |
|-----------|---------------------|
| Bắt đầu dự án | *"Khởi tạo Next.js + Tailwind trong thư mục này, rồi hướng dẫn tôi chạy dev."* |
| Lên kế hoạch việc lớn | *"Trước khi code, lập kế hoạch các bước và cho tôi duyệt."* |
| Thêm bảng/cột DB | *"Tạo migration thêm [bảng/cột] ... và chạy migrate."* |
| Thêm 1 trang | *"Tạo trang /[tên] hiển thị ... lấy dữ liệu từ bảng ..., style giống các trang khác."* |
| Thêm API | *"Tạo endpoint POST /api/... nhận ..., xác thực ..., trả về ..."* |
| Kiểm tra trước khi tin | *"Chạy build và type-check, sửa hết lỗi rồi báo tôi."* |
| Báo lỗi | *"Lỗi như sau: [dán nguyên văn]. Sửa và giải thích nguyên nhân."* |
| Lưu tiến độ | *"Commit lại với mô tả ngắn gọn."* |
| Quay lui | *"Quay lại commit gần nhất, bỏ thay đổi chưa commit."* |
| Học khái niệm | *"Giải thích [X] cho người mới, ví dụ trong dự án này."* |
| Deploy | *"Hướng dẫn tôi deploy lên VPS Ubuntu từng bước."* |

---

## Checklist tổng

- [ ] Cài Claude Code, Node 20+, Docker, Git
- [ ] Khởi tạo Next.js, chạy được `localhost:3000`
- [ ] Bật Postgres bằng Docker, chạy migration đầu tiên
- [ ] Xong đăng nhập (login + bảo vệ trang nội bộ)
- [ ] Có layout + dashboard
- [ ] Làm xong 1 tính năng CRUD (vd Tin tức)
- [ ] Lấy dữ liệu ngoài (RSS) + nút fetch
- [ ] Cron tự chạy theo lịch
- [ ] (Tuỳ chọn) Kết nối API bên thứ ba
- [ ] Commit thường xuyên lên GitHub
- [ ] Deploy lên VPS + SSL

> **Nhớ:** bạn không cần thuộc lòng gì cả. Tài liệu này là để bạn biết **trình
> tự** và **cách ra lệnh**. Phần còn lại — cứ hỏi Claude. Chúc bạn xây vui! 🚀
