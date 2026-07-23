# Tài Liệu Mô Tả Use Case — Marketing OS

> **Phiên bản:** 1.0 | **Ngày:** 2026-07-22 | **Tác giả:** Taki Team

---

## 1. Tổng Quan Hệ Thống

**Marketing OS** là nền tảng quản lý marketing đa kênh dành cho doanh nghiệp Việt Nam, cho phép theo dõi hiệu suất toàn diện trên các kênh mạng xã hội, quảng cáo trả phí và công cụ AI hỗ trợ sáng tạo nội dung.

### 1.1 Actor

| Actor | Mô tả |
|-------|-------|
| **Admin** | Quản trị viên hệ thống — có toàn quyền cấu hình, quản lý thành viên, kết nối tích hợp và vận hành hệ thống |
| **Member** | Thành viên team marketing — có quyền xem dữ liệu, tạo brief nội dung và sử dụng AI tools |

---

## 2. Use Case Diagram (PlantUML Notation)

### 2.1 Tổng thể hệ thống

```
@startuml Marketing_OS_Overview
left to right direction

actor Admin
actor Member

rectangle "Marketing OS" {
  package "Xác thực" {
    usecase "Đăng nhập" as AUTH01
    usecase "Đổi mật khẩu" as AUTH02
    usecase "Đăng xuất" as AUTH03
  }

  package "Dashboard" {
    usecase "Xem KPI tổng quan" as DASH01
    usecase "Lọc theo thời gian" as DASH02
    usecase "Xem trend chart" as DASH03
    usecase "Xem top kênh" as DASH04
  }

  package "Kênh" {
    usecase "Kết nối Facebook" as CH01
    usecase "Kết nối Bundle.social" as CH02
    usecase "Đồng bộ dữ liệu kênh" as CH03
    usecase "Nhập chỉ số thủ công" as CH04
    usecase "Phân loại kênh bằng tag" as CH05
    usecase "Xem chi tiết kênh" as CH06
    usecase "Quản lý quyền kênh" as CH07
  }

  package "Quảng cáo" {
    usecase "Kết nối Facebook Ads" as ADS01
    usecase "Xem hiệu suất chiến dịch" as ADS02
    usecase "Đồng bộ dữ liệu ads" as ADS03
    usecase "Phân tích AI" as ADS04
  }

  package "Brief nội dung" {
    usecase "Tạo brief mới" as BR01
    usecase "Duyệt / cập nhật trạng thái" as BR02
    usecase "Xem audit log" as BR03
    usecase "Tạo nội dung bằng AI" as BR04
  }

  package "AI Tools" {
    usecase "Skill Library" as AI01
    usecase "Tạo Project AI" as AI02
    usecase "Chat trong Project" as AI03
    usecase "Telegram Bot Q&A" as AI04
  }

  package "Quản trị" {
    usecase "Cấu hình tích hợp" as ADM01
    usecase "Quản lý thành viên" as ADM02
    usecase "Xem cron logs" as ADM03
    usecase "Kích hoạt run job" as ADM04
    usecase "Báo cáo Telegram tự động" as ADM05
  }
}

Admin --> AUTH01
Admin --> AUTH02
Admin --> AUTH03
Member --> AUTH01
Member --> AUTH02
Member --> AUTH03

Admin --> DASH01
Admin --> DASH02
Admin --> DASH03
Admin --> DASH04
Member --> DASH01
Member --> DASH02
Member --> DASH03
Member --> DASH04

Admin --> CH01
Admin --> CH02
Admin --> CH03
Admin --> CH04
Admin --> CH05
Admin --> CH06
Admin --> CH07
Member --> CH06

Admin --> ADS01
Admin --> ADS02
Admin --> ADS03
Admin --> ADS04
Member --> ADS02
Member --> ADS04

Admin --> BR01
Admin --> BR02
Admin --> BR03
Admin --> BR04
Member --> BR01
Member --> BR02
Member --> BR03
Member --> BR04

Admin --> AI01
Admin --> AI02
Admin --> AI03
Admin --> AI04
Member --> AI01
Member --> AI02
Member --> AI03
Member --> AI04

Admin --> ADM01
Admin --> ADM02
Admin --> ADM03
Admin --> ADM04
Admin --> ADM05

@enduml
```

---

## 3. Mô Tả Chi Tiết Use Case

---

### NHÓM XÁC THỰC (UC-AUTH)

---

#### UC-AUTH-01: Đăng Nhập Hệ Thống

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-AUTH-01 |
| **Tên** | Đăng nhập hệ thống |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng xác thực danh tính để truy cập Marketing OS bằng email và mật khẩu. |

**Pre-condition:**
- Tài khoản đã được Admin tạo trong hệ thống.
- Người dùng chưa đăng nhập.

**Main Flow:**
1. Người dùng truy cập trang đăng nhập của Marketing OS.
2. Người dùng nhập địa chỉ email và mật khẩu.
3. Hệ thống xác thực thông tin đăng nhập.
4. Hệ thống tạo session và chuyển hướng đến Dashboard tổng quan.

**Luồng thay thế / Ngoại lệ:**
- **3a.** Email hoặc mật khẩu sai: Hệ thống hiển thị thông báo lỗi, yêu cầu nhập lại.
- **3b.** Tài khoản bị khoá: Hệ thống hiển thị thông báo liên hệ Admin.
- **3c.** Nhập sai quá 5 lần: Hệ thống khoá đăng nhập tạm thời 15 phút.

**Post-condition:**
- Người dùng đã đăng nhập thành công, session hợp lệ được tạo.
- Ghi log thời gian đăng nhập vào hệ thống.

---

#### UC-AUTH-02: Đổi Mật Khẩu

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-AUTH-02 |
| **Tên** | Đổi mật khẩu |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng thay đổi mật khẩu tài khoản của mình sau khi đã xác thực. |

**Pre-condition:**
- Người dùng đã đăng nhập vào hệ thống.

**Main Flow:**
1. Người dùng vào mục Cài đặt tài khoản.
2. Người dùng nhập mật khẩu hiện tại.
3. Người dùng nhập mật khẩu mới và xác nhận lại.
4. Hệ thống kiểm tra mật khẩu hiện tại khớp và mật khẩu mới đủ độ mạnh.
5. Hệ thống cập nhật mật khẩu và thông báo thành công.

**Luồng thay thế / Ngoại lệ:**
- **4a.** Mật khẩu hiện tại sai: Hệ thống báo lỗi.
- **4b.** Mật khẩu mới không đủ mạnh (< 8 ký tự): Hiển thị yêu cầu độ mạnh.
- **4c.** Mật khẩu mới và xác nhận không khớp: Hiển thị lỗi tương ứng.

**Post-condition:**
- Mật khẩu mới được lưu. Admin reset mật khẩu cũng sử dụng luồng tương tự (xem UC-ADM-02).

---

#### UC-AUTH-03: Đăng Xuất

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-AUTH-03 |
| **Tên** | Đăng xuất |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng kết thúc phiên làm việc và thoát khỏi hệ thống. |

**Pre-condition:**
- Người dùng đang trong phiên đăng nhập hợp lệ.

**Main Flow:**
1. Người dùng nhấn nút "Đăng xuất" trên thanh menu.
2. Hệ thống huỷ session hiện tại.
3. Hệ thống chuyển hướng về trang đăng nhập.

**Luồng thay thế / Ngoại lệ:**
- **2a.** Session đã hết hạn tự động: Hệ thống tự chuyển hướng về trang đăng nhập với thông báo "Phiên đã hết hạn".

**Post-condition:**
- Session bị huỷ, người dùng không thể truy cập hệ thống mà không đăng nhập lại.

---

### NHÓM DASHBOARD (UC-DASH)

```
[Admin] ──┬── UC-DASH-01: Xem KPI tổng quan
[Member] ─┤── UC-DASH-02: Lọc theo thời gian
          ├── UC-DASH-03: Xem trend chart
          └── UC-DASH-04: Xem top kênh hiệu suất cao
```

---

#### UC-DASH-01: Xem Dashboard KPI Tổng Quan

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-DASH-01 |
| **Tên** | Xem Dashboard KPI tổng quan |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng xem tổng hợp các chỉ số KPI marketing quan trọng: Reach, Leads, Engagement Rate, Followers, Conversions, Spend. |

**Pre-condition:**
- Người dùng đã đăng nhập.
- Ít nhất một kênh đã được kết nối và đồng bộ dữ liệu.

**Main Flow:**
1. Người dùng vào trang Dashboard.
2. Hệ thống truy vấn dữ liệu từ các kênh đã kết nối theo khoảng thời gian mặc định (7 ngày).
3. Hệ thống hiển thị các card KPI: Reach, Leads, ER, Followers, Conversions, Spend.
4. Mỗi card hiển thị giá trị hiện tại và % thay đổi so với kỳ trước.

**Luồng thay thế / Ngoại lệ:**
- **2a.** Chưa có kênh nào: Hệ thống hiển thị thông báo hướng dẫn kết nối kênh.
- **2b.** Lỗi kết nối dữ liệu: Hiển thị trạng thái lỗi trên từng card, không ảnh hưởng các card khác.

**Post-condition:**
- Dashboard hiển thị đầy đủ KPI với dữ liệu mới nhất từ tất cả kênh đã kết nối.

---

#### UC-DASH-02: Lọc Dữ Liệu Theo Khoảng Thời Gian

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-DASH-02 |
| **Tên** | Lọc dữ liệu theo khoảng thời gian |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng lọc dữ liệu dashboard theo các mốc thời gian định sẵn hoặc tùy chỉnh. |

**Pre-condition:**
- Đang xem Dashboard (UC-DASH-01).

**Main Flow:**
1. Người dùng nhấn vào bộ lọc thời gian.
2. Hệ thống hiển thị các tùy chọn: Hôm qua, 7 ngày qua, 30 ngày qua, Tháng này, Tháng trước, Tùy chỉnh.
3. Người dùng chọn khoảng thời gian mong muốn.
4. Hệ thống tải lại tất cả dữ liệu Dashboard theo khoảng thời gian đã chọn.

**Luồng thay thế / Ngoại lệ:**
- **3a.** Chọn "Tùy chỉnh": Hiển thị date picker để nhập ngày bắt đầu và kết thúc.
- **4a.** Không có dữ liệu trong khoảng thời gian: Hiển thị "Không có dữ liệu trong kỳ này".

**Post-condition:**
- Toàn bộ Dashboard cập nhật theo khoảng thời gian vừa chọn.

---

#### UC-DASH-03: Xem Xu Hướng Theo Biểu Đồ

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-DASH-03 |
| **Tên** | Xem xu hướng theo biểu đồ (Trend Chart) |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng xem biểu đồ đường thể hiện xu hướng thay đổi của các chỉ số theo thời gian. |

**Pre-condition:**
- Đang xem Dashboard với dữ liệu đã tải.

**Main Flow:**
1. Người dùng kéo xuống phần Trend Chart trên Dashboard.
2. Hệ thống hiển thị biểu đồ đường cho các chỉ số được chọn trong khoảng thời gian hiện tại.
3. Người dùng hover vào từng điểm dữ liệu để xem giá trị chi tiết.
4. Người dùng tích/bỏ tích các chỉ số để tuỳ chỉnh hiển thị trên biểu đồ.

**Luồng thay thế / Ngoại lệ:**
- **2a.** Dữ liệu quá thưa (< 2 điểm): Hệ thống hiển thị dạng bar chart thay thế.

**Post-condition:**
- Biểu đồ hiển thị đúng xu hướng theo khoảng thời gian và chỉ số đã chọn.

---

#### UC-DASH-04: Xem Top Kênh Hiệu Suất Cao

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-DASH-04 |
| **Tên** | Xem top kênh hiệu suất cao |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng xem bảng xếp hạng các kênh theo hiệu suất trong kỳ đang chọn. |

**Pre-condition:**
- Đang xem Dashboard, có ít nhất 2 kênh đang hoạt động.

**Main Flow:**
1. Hệ thống tự động hiển thị bảng Top Kênh bên dưới biểu đồ.
2. Hệ thống xếp hạng các kênh dựa theo chỉ số Reach hoặc Engagement Rate.
3. Người dùng xem tên kênh, platform, chỉ số chính và thứ hạng.
4. Người dùng nhấn vào kênh để chuyển sang xem chi tiết (UC-CH-06).

**Luồng thay thế / Ngoại lệ:**
- **2a.** Người dùng thay đổi tiêu chí xếp hạng (Reach/ER/Followers): Bảng cập nhật ngay lập tức.

**Post-condition:**
- Người dùng nắm được kênh nào đang hoạt động hiệu quả nhất trong kỳ.

---

### NHÓM KÊNH (UC-CH)

```
[Admin] ──┬── UC-CH-01: Kết nối Facebook (OAuth)
          ├── UC-CH-02: Kết nối Bundle.social
          ├── UC-CH-03: Đồng bộ thủ công
          ├── UC-CH-04: Nhập chỉ số manual
          ├── UC-CH-05: Phân loại tag
          ├── UC-CH-06: Xem chi tiết ◄── [Member]
          └── UC-CH-07: Quản lý quyền member
```

---

#### UC-CH-01: Kết Nối Kênh Facebook (OAuth)

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-CH-01 |
| **Tên** | Kết nối kênh Facebook qua OAuth |
| **Actor** | Admin |
| **Mô tả** | Admin kết nối Facebook Page vào hệ thống để tự động lấy dữ liệu insights qua Facebook Graph API. |

**Pre-condition:**
- Admin đã đăng nhập.
- Admin sở hữu hoặc có quyền quản lý Facebook Page cần kết nối.
- Facebook App ID và App Secret đã cấu hình trong UC-ADM-01.

**Main Flow:**
1. Admin vào mục Kênh → Thêm kênh mới → Chọn Facebook.
2. Hệ thống chuyển hướng đến cửa sổ OAuth Facebook.
3. Admin đăng nhập Facebook và cấp quyền cho ứng dụng (pages_read_engagement, pages_show_list, read_insights).
4. Facebook trả về access token, hệ thống lưu token vào database.
5. Hệ thống tự động lấy danh sách Page và yêu cầu Admin chọn Page muốn kết nối.
6. Hệ thống lưu Page ID, Page Name, access token và thực hiện đồng bộ lần đầu.

**Luồng thay thế / Ngoại lệ:**
- **3a.** Admin huỷ OAuth: Hệ thống huỷ quá trình, không lưu thông tin.
- **4a.** Token không hợp lệ: Hiển thị lỗi, yêu cầu thực hiện lại.
- **6a.** Lỗi khi đồng bộ lần đầu: Kênh vẫn được tạo, đồng bộ sẽ chạy lại theo lịch cron.

**Post-condition:**
- Kênh Facebook được tạo với trạng thái "Đã kết nối".
- Dữ liệu insights bắt đầu được thu thập theo lịch cron hàng ngày.

---

#### UC-CH-02: Kết Nối Kênh Đa Nền Tảng Qua Bundle.social

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-CH-02 |
| **Tên** | Kết nối kênh qua Bundle.social |
| **Actor** | Admin |
| **Mô tả** | Admin kết nối các kênh TikTok, YouTube, Instagram, LinkedIn thông qua dịch vụ trung gian Bundle.social. |

**Pre-condition:**
- Admin đã có tài khoản Bundle.social và API key.
- Bundle.social API key đã cấu hình trong hệ thống.

**Main Flow:**
1. Admin vào Kênh → Thêm kênh mới → Chọn nền tảng (TikTok / YouTube / Instagram / LinkedIn).
2. Hệ thống chuyển hướng đến Bundle.social để xác thực.
3. Admin đăng nhập tài khoản mạng xã hội tương ứng và cấp quyền.
4. Bundle.social trả về channel ID và credentials cho hệ thống.
5. Hệ thống tạo kênh và đồng bộ dữ liệu ban đầu.

**Luồng thay thế / Ngoại lệ:**
- **2a.** Bundle.social API key không hợp lệ: Thông báo lỗi và hướng dẫn vào mục Cấu hình.
- **4a.** Nền tảng không hỗ trợ: Hệ thống thông báo kênh cần nhập thủ công (UC-CH-04).

**Post-condition:**
- Kênh được tạo và dữ liệu định kỳ được lấy qua Bundle.social API.

---

#### UC-CH-03: Đồng Bộ Dữ Liệu Kênh Thủ Công

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-CH-03 |
| **Tên** | Đồng bộ dữ liệu kênh thủ công |
| **Actor** | Admin |
| **Mô tả** | Admin kích hoạt đồng bộ dữ liệu ngay lập tức cho một hoặc nhiều kênh, không cần chờ lịch cron. |

**Pre-condition:**
- Kênh đã kết nối thành công.

**Main Flow:**
1. Admin vào trang Chi tiết kênh hoặc danh sách kênh.
2. Admin nhấn nút "Đồng bộ ngay".
3. Hệ thống gọi API lấy dữ liệu mới nhất từ nền tảng.
4. Hệ thống cập nhật dữ liệu vào database và hiển thị thông báo "Đồng bộ thành công".

**Luồng thay thế / Ngoại lệ:**
- **3a.** API nền tảng trả lỗi (rate limit / token hết hạn): Thông báo lỗi cụ thể, gợi ý làm mới token.
- **3b.** Đang đồng bộ: Nút bị vô hiệu hoá, hiển thị trạng thái loading.

**Post-condition:**
- Dữ liệu kênh được cập nhật đến thời điểm hiện tại. Lịch sử đồng bộ được ghi lại.

---

#### UC-CH-04: Nhập Chỉ Số Thủ Công Cho Kênh Manual

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-CH-04 |
| **Tên** | Nhập chỉ số thủ công cho kênh manual |
| **Actor** | Admin |
| **Mô tả** | Admin nhập tay các chỉ số cho kênh không có API tự động (Zalo, báo điện tử, offline). |

**Pre-condition:**
- Kênh loại "manual" đã được tạo trong hệ thống.

**Main Flow:**
1. Admin vào trang chi tiết kênh manual.
2. Admin chọn "Nhập chỉ số" và điền ngày báo cáo.
3. Admin nhập các chỉ số: Reach, Followers, Engagement Rate, Leads, v.v.
4. Admin nhấn Lưu. Hệ thống lưu dữ liệu và cập nhật Dashboard.

**Luồng thay thế / Ngoại lệ:**
- **3a.** Giá trị nhập âm hoặc không hợp lệ: Hiển thị validation lỗi tương ứng.
- **3b.** Trùng ngày đã có dữ liệu: Hệ thống hỏi xác nhận trước khi ghi đè.

**Post-condition:**
- Chỉ số được lưu và phản ánh ngay trên Dashboard.

---

#### UC-CH-05: Phân Loại Kênh Bằng Tag

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-CH-05 |
| **Tên** | Phân loại kênh bằng tag |
| **Actor** | Admin |
| **Mô tả** | Admin gắn nhãn (tag) cho kênh để phân nhóm và lọc dữ liệu theo chiến lược (ví dụ: "Brand", "Performance", "Product A"). |

**Pre-condition:**
- Kênh đã được tạo.

**Main Flow:**
1. Admin vào trang chỉnh sửa kênh.
2. Admin nhập tag mới hoặc chọn từ danh sách tag có sẵn.
3. Admin lưu thay đổi.
4. Hệ thống cập nhật tag và kênh xuất hiện đúng nhóm khi lọc.

**Post-condition:**
- Kênh được gắn tag, có thể lọc theo tag trên Dashboard và danh sách kênh.

---

#### UC-CH-06: Xem Chi Tiết Kênh

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-CH-06 |
| **Tên** | Xem chi tiết kênh |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng xem thông tin chi tiết của một kênh: các bài đăng gần đây, chỉ số hiệu suất, health score và thông tin kết nối. |

**Pre-condition:**
- Người dùng có quyền truy cập kênh đó (Admin: tất cả; Member: kênh được cấp phép).

**Main Flow:**
1. Người dùng nhấn vào kênh trong danh sách hoặc từ Dashboard.
2. Hệ thống hiển thị trang chi tiết gồm: thông tin kênh, chỉ số theo kỳ, health score, danh sách bài đăng.
3. Người dùng xem biểu đồ chỉ số và danh sách bài đăng gần nhất.
4. Với kênh Facebook: hiển thị thêm Page ID và nút xem Access Token (Admin only).

**Luồng thay thế / Ngoại lệ:**
- **2a.** Member không có quyền: Hiển thị lỗi 403 hoặc không thấy kênh trong danh sách.

**Post-condition:**
- Người dùng nắm đầy đủ tình trạng và hiệu suất kênh.

---

#### UC-CH-07: Quản Lý Quyền Truy Cập Kênh Theo Member

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-CH-07 |
| **Tên** | Quản lý quyền truy cập kênh theo member |
| **Actor** | Admin |
| **Mô tả** | Admin phân quyền xem/quản lý từng kênh cho từng Member trong team. |

**Pre-condition:**
- Đã có ít nhất một Member trong hệ thống (UC-ADM-02).
- Đã có ít nhất một kênh.

**Main Flow:**
1. Admin vào trang Quản lý thành viên hoặc trang Chi tiết kênh.
2. Admin chọn member cần phân quyền.
3. Admin tích chọn các kênh mà member được phép truy cập.
4. Hệ thống lưu phân quyền.

**Luồng thay thế / Ngoại lệ:**
- **3a.** Cấp quyền toàn bộ kênh: Tùy chọn "Cho phép tất cả kênh".

**Post-condition:**
- Member chỉ thấy và truy cập được các kênh đã được cấp phép.

---

### NHÓM QUẢNG CÁO (UC-ADS)

```
[Admin] ──┬── UC-ADS-01: Kết nối Facebook Ads
          ├── UC-ADS-02: Xem hiệu suất chiến dịch ◄── [Member]
          ├── UC-ADS-03: Đồng bộ dữ liệu ads
          └── UC-ADS-04: Phân tích AI ◄── [Member]
```

---

#### UC-ADS-01: Kết Nối Tài Khoản Quảng Cáo Facebook Ads

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-ADS-01 |
| **Tên** | Kết nối tài khoản quảng cáo Facebook Ads |
| **Actor** | Admin |
| **Mô tả** | Admin kết nối Facebook Ads Account vào hệ thống để theo dõi hiệu suất quảng cáo. |

**Pre-condition:**
- Đã cấu hình Facebook App (UC-ADM-01).
- Admin có quyền truy cập vào Facebook Ads Account.

**Main Flow:**
1. Admin vào mục Quảng cáo → Kết nối tài khoản ads.
2. Hệ thống thực hiện OAuth Facebook với scope ads_read.
3. Admin chọn Ad Account ID cần kết nối.
4. Hệ thống lưu thông tin và thực hiện đồng bộ lần đầu cho 30 ngày gần nhất.

**Luồng thay thế / Ngoại lệ:**
- **3a.** Không có Ad Account nào: Thông báo tài khoản Facebook chưa có Ads Account.
- **4a.** Lỗi API: Lưu kết nối nhưng ghi nhận lỗi đồng bộ, thử lại sau.

**Post-condition:**
- Tài khoản ads được kết nối, dữ liệu campaign bắt đầu hiển thị.

---

#### UC-ADS-02: Xem Hiệu Suất Chiến Dịch

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-ADS-02 |
| **Tên** | Xem hiệu suất chiến dịch quảng cáo |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng xem báo cáo hiệu suất các chiến dịch ads với các chỉ số: Spend, CPA, ROAS, Conversions, Impressions, CTR. |

**Pre-condition:**
- Tài khoản ads đã kết nối và đã đồng bộ dữ liệu.

**Main Flow:**
1. Người dùng vào mục Quảng cáo.
2. Hệ thống hiển thị danh sách tất cả chiến dịch với các chỉ số tóm tắt.
3. Người dùng lọc theo khoảng thời gian, trạng thái chiến dịch (active/paused/all).
4. Người dùng xem biểu đồ Spend và Conversions theo thời gian.
5. Người dùng nhấn vào từng chiến dịch để xem chi tiết ad sets và ads.

**Luồng thay thế / Ngoại lệ:**
- **2a.** Chưa có dữ liệu: Hướng dẫn chạy đồng bộ (UC-ADS-03).

**Post-condition:**
- Người dùng nắm rõ hiệu suất và chi phí của từng chiến dịch.

---

#### UC-ADS-03: Đồng Bộ Dữ Liệu Ads

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-ADS-03 |
| **Tên** | Đồng bộ dữ liệu ads |
| **Actor** | Admin |
| **Mô tả** | Admin kích hoạt đồng bộ dữ liệu quảng cáo từ Facebook Ads API ngay lập tức. |

**Pre-condition:**
- Tài khoản ads đã kết nối.

**Main Flow:**
1. Admin nhấn "Đồng bộ ads" trên trang Quảng cáo.
2. Hệ thống gọi Facebook Marketing API để lấy dữ liệu campaign/adset/ad trong 30 ngày qua.
3. Hệ thống cập nhật dữ liệu và hiển thị thông báo hoàn tất.

**Luồng thay thế / Ngoại lệ:**
- **2a.** Rate limit Facebook API: Hệ thống retry sau 5 phút, ghi log.
- **2b.** Token hết hạn: Thông báo Admin cần kết nối lại tài khoản ads.

**Post-condition:**
- Dữ liệu ads được cập nhật, timestamp đồng bộ mới nhất được ghi lại.

---

#### UC-ADS-04: Phân Tích Chiến Dịch Bằng AI

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-ADS-04 |
| **Tên** | Phân tích chiến dịch bằng AI |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng yêu cầu AI phân tích dữ liệu quảng cáo, nhận xét hiệu suất và đề xuất tối ưu. |

**Pre-condition:**
- Dữ liệu ads đã được đồng bộ.
- Cấu hình OpenRouter API key hợp lệ (UC-ADM-01).

**Main Flow:**
1. Người dùng chọn chiến dịch hoặc khoảng thời gian cần phân tích.
2. Người dùng nhấn "Phân tích bằng AI".
3. Hệ thống gửi dữ liệu ads đến OpenRouter AI (kèm context: mục tiêu, ngân sách).
4. AI trả về phân tích: nhận xét về CPA, ROAS, đề xuất tối ưu ngân sách và targeting.
5. Kết quả hiển thị dạng báo cáo text, có thể copy hoặc xuất PDF.

**Luồng thay thế / Ngoại lệ:**
- **3a.** OpenRouter API lỗi: Thông báo lỗi, gợi ý thử lại sau.

**Post-condition:**
- Người dùng có báo cáo phân tích AI về chiến dịch để đưa ra quyết định tối ưu.

---

### NHÓM BRIEF NỘI DUNG (UC-BRIEF)

```
[Admin]  ──┬── UC-BRIEF-01: Tạo brief mới ◄── [Member]
[Member] ──├── UC-BRIEF-02: Duyệt/cập nhật trạng thái ◄── [Admin]
           ├── UC-BRIEF-03: Xem audit log
           └── UC-BRIEF-04: Tạo nội dung bằng AI
```

---

#### UC-BRIEF-01: Tạo Brief Nội Dung Mới

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-BRIEF-01 |
| **Tên** | Tạo brief nội dung mới |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng tạo brief mô tả yêu cầu nội dung cho một bài đăng, chiến dịch hoặc kênh cụ thể. |

**Pre-condition:**
- Người dùng đã đăng nhập.

**Main Flow:**
1. Người dùng vào mục Brief → Tạo mới.
2. Nhập thông tin: Tiêu đề, kênh đích, mục tiêu, thông điệp chính, đối tượng, tone of voice, deadline.
3. Chọn trạng thái ban đầu: Draft.
4. Nhấn Lưu. Hệ thống tạo brief với ID duy nhất và ghi log khởi tạo.

**Luồng thay thế / Ngoại lệ:**
- **2a.** Thiếu trường bắt buộc (tiêu đề, kênh): Hiển thị validation và ngăn lưu.
- **4a.** Lưu nháp: Người dùng có thể lưu tạm mà không điền đủ thông tin.

**Post-condition:**
- Brief được tạo với trạng thái "Draft", xuất hiện trong danh sách Brief.

---

#### UC-BRIEF-02: Duyệt Và Cập Nhật Trạng Thái Brief

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-BRIEF-02 |
| **Tên** | Duyệt và cập nhật trạng thái brief |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng chuyển trạng thái brief qua các bước: Draft → Review → Approved → Published. |

**Pre-condition:**
- Brief đã tồn tại trong hệ thống.

**Main Flow:**
1. Người dùng mở brief cần cập nhật.
2. Người dùng nhấn nút chuyển trạng thái (ví dụ: "Gửi duyệt", "Duyệt", "Xuất bản").
3. Hệ thống kiểm tra quyền: chỉ Admin mới có thể chuyển sang Approved.
4. Hệ thống cập nhật trạng thái và ghi log thay đổi (ai, lúc nào, từ trạng thái nào).

**Luồng thay thế / Ngoại lệ:**
- **3a.** Member cố chuyển sang Approved: Hệ thống từ chối, thông báo cần Admin duyệt.
- **2a.** Reject brief: Admin có thể từ chối và ghi chú lý do, brief trả về Draft.

**Post-condition:**
- Brief ở trạng thái mới, audit log được cập nhật đầy đủ.

---

#### UC-BRIEF-03: Xem Lịch Sử Thay Đổi Brief (Audit Log)

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-BRIEF-03 |
| **Tên** | Xem lịch sử thay đổi brief |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng xem toàn bộ lịch sử chỉnh sửa và thay đổi trạng thái của một brief. |

**Pre-condition:**
- Brief đã có ít nhất một lịch sử thay đổi.

**Main Flow:**
1. Người dùng mở trang chi tiết brief.
2. Người dùng chọn tab "Lịch sử thay đổi" / "Audit Log".
3. Hệ thống hiển thị danh sách theo thứ tự thời gian: thời điểm, người thực hiện, hành động, nội dung thay đổi.

**Post-condition:**
- Người dùng có thể trace lại toàn bộ quá trình thay đổi của brief.

---

#### UC-BRIEF-04: Tạo Nội Dung Từ Brief Bằng AI

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-BRIEF-04 |
| **Tên** | Tạo nội dung từ brief bằng AI |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng dùng AI để tự động tạo caption, nội dung bài đăng dựa trên thông tin đã nhập trong brief. |

**Pre-condition:**
- Brief đã có đủ thông tin (mục tiêu, thông điệp, tone of voice).
- OpenRouter API key hợp lệ.

**Main Flow:**
1. Người dùng mở brief, nhấn "Tạo nội dung với AI".
2. Hệ thống gửi thông tin brief đến AI model qua OpenRouter.
3. AI sinh ra 2-3 phiên bản nội dung gợi ý.
4. Người dùng chọn phiên bản phù hợp, chỉnh sửa và lưu vào brief.

**Luồng thay thế / Ngoại lệ:**
- **3a.** Kết quả AI không phù hợp: Người dùng nhấn "Tạo lại" với ghi chú điều chỉnh.

**Post-condition:**
- Nội dung được gắn với brief và sẵn sàng để review/publish.

---

### NHÓM AI TOOLS (UC-AI)

```
[Admin]  ──┬── UC-AI-01: Skill Library ◄── [Member]
[Member] ──├── UC-AI-02: Tạo Project AI ◄── [Admin]
           ├── UC-AI-03: Chat trong Project
           └── UC-AI-04: Telegram Bot Q&A
```

---

#### UC-AI-01: Upload Và Chat Với Tài Liệu Kỹ Năng (Skill Library)

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-AI-01 |
| **Tên** | Upload và chat với tài liệu kỹ năng |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng upload tài liệu (PDF, DOCX, TXT) vào thư viện kỹ năng và đặt câu hỏi với AI dựa trên tài liệu đó. |

**Pre-condition:**
- Người dùng đã đăng nhập. OpenRouter API key hợp lệ.

**Main Flow:**
1. Người dùng vào mục AI Tools → Skill Library.
2. Người dùng upload tài liệu (kéo thả hoặc chọn file).
3. Hệ thống xử lý và lập chỉ mục nội dung tài liệu.
4. Người dùng nhập câu hỏi vào ô chat.
5. AI trả lời dựa trên nội dung tài liệu, kèm trích dẫn nguồn.

**Luồng thay thế / Ngoại lệ:**
- **2a.** File quá lớn (> 20MB) hoặc không đúng định dạng: Thông báo lỗi.
- **3a.** Tài liệu không thể đọc được (hình ảnh scan): Thông báo OCR không hỗ trợ.

**Post-condition:**
- Tài liệu lưu trong Skill Library, có thể truy cập và chat lại lần sau.

---

#### UC-AI-02: Tạo Project AI Workspace

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-AI-02 |
| **Tên** | Tạo Project AI workspace với knowledge files |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng tạo không gian làm việc AI riêng cho một dự án, nhúng knowledge files để AI có context cụ thể. |

**Pre-condition:**
- Người dùng đã đăng nhập.

**Main Flow:**
1. Người dùng vào AI Tools → Projects → Tạo project mới.
2. Nhập tên project, mô tả và system prompt (hướng dẫn cho AI).
3. Upload các knowledge files (tài liệu sản phẩm, brand guideline, data nội bộ).
4. Hệ thống tạo project và lập chỉ mục knowledge files.
5. Project sẵn sàng sử dụng.

**Post-condition:**
- Project AI được tạo với knowledge riêng. Các member được phân quyền có thể truy cập.

---

#### UC-AI-03: Chat Với AI Trong Project

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-AI-03 |
| **Tên** | Chat với AI trong project |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng đặt câu hỏi, yêu cầu viết nội dung, phân tích dữ liệu trong không gian Project AI. |

**Pre-condition:**
- Project AI đã được tạo (UC-AI-02). Người dùng có quyền truy cập project.

**Main Flow:**
1. Người dùng vào Project → nhấn "Chat".
2. Người dùng nhập câu hỏi hoặc yêu cầu.
3. Hệ thống kết hợp system prompt, knowledge files và câu hỏi gửi đến AI model.
4. AI trả lời với context từ knowledge files của project.
5. Lịch sử chat được lưu trong project.

**Luồng thay thế / Ngoại lệ:**
- **3a.** Knowledge files quá lớn, vượt context window: Hệ thống tự cắt tỉa context theo độ liên quan.

**Post-condition:**
- Câu trả lời AI được hiển thị và lịch sử chat được lưu lại.

---

#### UC-AI-04: Hỏi Đáp Data Marketing Qua Telegram Bot

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-AI-04 |
| **Tên** | Hỏi đáp data marketing qua Telegram bot |
| **Actor** | Admin, Member |
| **Mô tả** | Người dùng nhắn tin cho Telegram bot để hỏi dữ liệu marketing mà không cần mở Dashboard. |

**Pre-condition:**
- Telegram Bot Token đã cấu hình (UC-ADM-01). Người dùng đã liên kết tài khoản Telegram.

**Main Flow:**
1. Người dùng nhắn tin cho bot (ví dụ: "Hôm qua reach kênh Facebook bao nhiêu?").
2. Bot nhận tin nhắn và phân tích ý định.
3. Hệ thống truy vấn database Marketing OS theo ý định.
4. Bot trả lời với số liệu chính xác, kèm so sánh kỳ trước (nếu có).

**Luồng thay thế / Ngoại lệ:**
- **2a.** Câu hỏi không rõ ràng: Bot hỏi lại để làm rõ.
- **3a.** Không có dữ liệu: Bot thông báo và gợi ý đồng bộ.

**Post-condition:**
- Người dùng nhận được dữ liệu marketing kịp thời ngay trên Telegram.

---

### NHÓM QUẢN TRỊ (UC-ADM)

```
[Admin only] ──┬── UC-ADM-01: Cấu hình tích hợp
               ├── UC-ADM-02: Quản lý thành viên
               ├── UC-ADM-03: Xem cron logs
               ├── UC-ADM-04: Kích hoạt run job
               └── UC-ADM-05: Báo cáo Telegram tự động
```

---

#### UC-ADM-01: Cấu Hình Tích Hợp

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-ADM-01 |
| **Tên** | Cấu hình tích hợp hệ thống |
| **Actor** | Admin |
| **Mô tả** | Admin thiết lập các thông tin tích hợp bên thứ ba: Facebook App, OpenRouter, Telegram, GA4, Lark/Notion, Bundle.social. |

**Pre-condition:**
- Admin đã đăng nhập với quyền cao nhất.

**Main Flow:**
1. Admin vào mục Cài đặt → Tích hợp.
2. Admin nhập thông tin cho từng service:
   - **Facebook**: App ID, App Secret
   - **OpenRouter**: API Key, model mặc định
   - **Telegram**: Bot Token, Chat ID nhận báo cáo
   - **GA4**: Measurement ID, API Secret
   - **Bundle.social**: API Key
   - **Lark**: Webhook URL
3. Admin nhấn Lưu từng mục. Hệ thống kiểm tra kết nối (test connection).
4. Hệ thống hiển thị trạng thái kết nối: Thành công / Lỗi.

**Luồng thay thế / Ngoại lệ:**
- **3a.** Thông tin không hợp lệ hoặc kết nối thất bại: Hiển thị thông báo lỗi cụ thể.

**Post-condition:**
- Các tích hợp hoạt động. Các tính năng phụ thuộc tích hợp được kích hoạt.

---

#### UC-ADM-02: Quản Lý Thành Viên Team

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-ADM-02 |
| **Tên** | Quản lý thành viên team |
| **Actor** | Admin |
| **Mô tả** | Admin thêm, xoá thành viên và reset mật khẩu cho các tài khoản trong hệ thống. |

**Pre-condition:**
- Admin đã đăng nhập.

**Main Flow:**
1. Admin vào mục Quản lý → Thành viên.
2. Để thêm member: Admin nhập email, họ tên, vai trò (Admin/Member) → Gửi lời mời hoặc tạo tài khoản.
3. Hệ thống tạo tài khoản với mật khẩu tạm thời và gửi email thông báo.
4. Để xoá: Admin chọn member → Xác nhận xoá → Hệ thống vô hiệu hoá tài khoản.
5. Để reset mật khẩu: Admin chọn member → Reset → Hệ thống gửi email mật khẩu mới.

**Luồng thay thế / Ngoại lệ:**
- **2a.** Email đã tồn tại: Thông báo "Email đã được sử dụng".
- **4a.** Admin tự xoá mình: Hệ thống ngăn chặn và hiển thị cảnh báo.

**Post-condition:**
- Danh sách thành viên được cập nhật. Member mới có thể đăng nhập ngay sau khi đổi mật khẩu tạm.

---

#### UC-ADM-03: Xem Lịch Sử Đồng Bộ Và Cron Logs

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-ADM-03 |
| **Tên** | Xem lịch sử đồng bộ và cron logs |
| **Actor** | Admin |
| **Mô tả** | Admin theo dõi lịch sử chạy các tác vụ tự động (cron jobs), phát hiện lỗi đồng bộ kịp thời. |

**Pre-condition:**
- Hệ thống đã có ít nhất một lần chạy cron.

**Main Flow:**
1. Admin vào mục Hệ thống → Cron Logs.
2. Hệ thống hiển thị danh sách các lần chạy: tên job, thời điểm chạy, trạng thái (Success/Failed), thời gian xử lý, thông báo lỗi (nếu có).
3. Admin lọc theo job name, ngày, trạng thái.
4. Admin xem chi tiết log của từng lần chạy.

**Luồng thay thế / Ngoại lệ:**
- **2a.** Chưa có log: Thông báo "Chưa có lịch sử đồng bộ nào".

**Post-condition:**
- Admin nắm được tình trạng vận hành tự động của hệ thống.

---

#### UC-ADM-04: Kích Hoạt Đồng Bộ Thủ Công (Run Job)

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-ADM-04 |
| **Tên** | Kích hoạt đồng bộ thủ công (Run Job) |
| **Actor** | Admin |
| **Mô tả** | Admin chạy thủ công một hoặc nhiều cron job ngay lập tức (sync kênh, sync ads, gửi báo cáo...) mà không cần đợi lịch tự động. |

**Pre-condition:**
- Admin đã đăng nhập. Ít nhất một kênh/ads account đã kết nối.

**Main Flow:**
1. Admin vào mục Hệ thống → Run Job.
2. Admin chọn loại job cần chạy: `page_insights`, `ads_ingestion`, `daily_report`, v.v.
3. Admin nhấn "Chạy ngay".
4. Hệ thống thực thi job và hiển thị tiến trình real-time.
5. Sau khi hoàn thành, hiển thị kết quả và ghi vào Cron Logs.

**Luồng thay thế / Ngoại lệ:**
- **3a.** Job đang chạy: Ngăn chạy lần thứ hai, hiển thị trạng thái đang xử lý.
- **4a.** Job thất bại: Hiển thị lỗi chi tiết và ghi log.

**Post-condition:**
- Job đã được thực thi, kết quả được lưu vào Cron Logs. Dữ liệu được cập nhật ngay.

---

#### UC-ADM-05: Nhận Báo Cáo Tự Động Telegram 07:00 Hàng Ngày

| Trường | Nội dung |
|--------|----------|
| **Mã UC** | UC-ADM-05 |
| **Tên** | Nhận báo cáo tự động Telegram 07:00 hàng ngày |
| **Actor** | Admin |
| **Mô tả** | Hệ thống tự động gửi báo cáo tóm tắt KPI ngày hôm qua vào Telegram lúc 07:00 mỗi sáng. |

**Pre-condition:**
- Telegram Bot Token và Chat ID đã cấu hình (UC-ADM-01).
- Cron job `daily_report` đang được kích hoạt.

**Main Flow:**
1. Lúc 07:00, cron job `daily_report` tự động kích hoạt.
2. Hệ thống tổng hợp dữ liệu KPI của ngày hôm qua: Reach, Leads, Spend, Conversions, ER.
3. Hệ thống so sánh với ngày hôm trước và tính % thay đổi.
4. Hệ thống format tin nhắn Markdown và gửi vào Telegram group/chat đã cấu hình.
5. Cron log ghi nhận việc gửi thành công.

**Luồng thay thế / Ngoại lệ:**
- **4a.** Telegram API lỗi (bot bị block, chat ID sai): Ghi lỗi vào log, không retry để tránh spam.
- **2a.** Không có dữ liệu hôm qua: Gửi báo cáo với ghi chú "Chưa có dữ liệu, vui lòng kiểm tra đồng bộ".

**Post-condition:**
- Admin nhận được báo cáo KPI hàng ngày sớm nhất lúc 07:00, sẵn sàng review trước khi bắt đầu ngày làm việc.

---

## 4. Ma Trận Quyền Truy Cập Use Case

| Use Case | Admin | Member |
|----------|:-----:|:------:|
| UC-AUTH-01 đến AUTH-03 | ✓ | ✓ |
| UC-DASH-01 đến DASH-04 | ✓ | ✓ |
| UC-CH-01 đến CH-05, CH-07 | ✓ | ✗ |
| UC-CH-06 | ✓ | ✓ (kênh được cấp phép) |
| UC-ADS-01, ADS-03 | ✓ | ✗ |
| UC-ADS-02, ADS-04 | ✓ | ✓ |
| UC-BRIEF-01 đến BRIEF-04 | ✓ | ✓ |
| UC-AI-01 đến AI-04 | ✓ | ✓ |
| UC-ADM-01 đến ADM-05 | ✓ | ✗ |

---

## 5. Ghi Chú Và Ràng Buộc Hệ Thống

- **Ngôn ngữ giao diện:** Tiếng Việt (mặc định), có thể mở rộng tiếng Anh.
- **Múi giờ:** UTC+7 (Việt Nam). Toàn bộ timestamp và báo cáo tuân theo múi giờ này.
- **Bảo mật token:** Facebook access token và API keys được mã hoá AES-256 trước khi lưu vào database.
- **Rate limit:** Hệ thống tôn trọng giới hạn gọi API của Facebook (200 calls/giờ/token) và tự động delay khi cần.
- **Audit trail:** Mọi thay đổi quan trọng (brief, phân quyền, cấu hình) đều được ghi log với timestamp và actor.
- **Session timeout:** Phiên đăng nhập tự động hết hạn sau 8 giờ không hoạt động.

---

*Tài liệu này là phần 04 trong bộ tài liệu kỹ thuật Marketing OS. Phiên bản tiếp theo sẽ bổ sung Use Case cho module báo cáo xuất Excel/PDF và tích hợp GA4.*
