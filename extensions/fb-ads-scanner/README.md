# FB Ads → Marketing OS (Chrome extension)

Quét **Facebook Ads Library** ngay trên trình duyệt của bạn rồi đẩy ad về
Marketing OS (hiện trong tab **Tin tức AI**). **Không cần Apify, không tốn phí.**

Cách hoạt động: extension hook response GraphQL của trang Ads Library → lấy JSON
ad có cấu trúc (id, page, nội dung, ảnh/video, ngày chạy) → POST về
`/api/news/ingest-ads` của website. Server map + lưu (dedupe theo link).

```
Mở facebook.com/ads/library → cuộn nạp ad → bấm Scan
   → extension gom ad → POST /api/news/ingest-ads (Bearer token)
   → news_article → hiện ở Tin tức AI (badge "FB Ads")
```

---

## 1. Cấu hình server (1 lần)

Đặt biến `ADS_INGEST_TOKEN` — chuỗi bí mật để xác thực extension. Hai cách:

**a) Qua env** (`app/.env` hoặc `.env.production`):

```bash
ADS_INGEST_TOKEN="dán-một-chuỗi-ngẫu-nhiên-dài"
```

Sinh token nhanh:

```bash
openssl rand -hex 24
```

**b) Hoặc qua DB** (`app_setting`, đã mã hoá) — dùng helper `setSetting('ADS_INGEST_TOKEN', '<token>', '<userId>')`.

> Route `/api/news/ingest-ads` đã được loại trừ khỏi proxy auth nên gọi được
> mà không cần đăng nhập; bảo mật dựa trên token này. Giữ token bí mật.

Khởi động lại app sau khi set env.

## 2. Cài extension (Developer mode)

1. Mở `chrome://extensions`
2. Bật **Developer mode** (góc phải trên)
3. **Load unpacked** → chọn thư mục `extensions/fb-ads-scanner/`
4. Ghim extension cho dễ bấm.

## 3. Cấu hình extension

Bấm icon extension → popup:

- **Website URL**: gốc website Marketing OS, ví dụ `https://marketing-os.cua-ban.com`
  (không kèm `/`).
- **Ingest token**: đúng chuỗi `ADS_INGEST_TOKEN` đã set ở bước 1.
- Bấm **Lưu**.

## 4. Quét

1. Mở <https://www.facebook.com/ads/library/>, chọn quốc gia/từ khoá/Page cần xem.
2. **Cuộn xuống** để Facebook nạp thêm ad (extension gom dần khi bạn cuộn).
3. Bấm icon extension → **Scan & đẩy**.
4. Popup báo `thêm mới N ad`. Vào **Tin tức AI** trên website để xem.

---

## Lưu ý

- Ads Library là trang **công khai** — extension không đụng tài khoản Facebook
  của bạn, chỉ đọc dữ liệu trang.
- Extension chỉ chạy script trên `facebook.com/ads/library*` (xem `manifest.json`).
- Nếu Scan báo "chưa bắt được ad": cuộn thêm để FB load ad, hoặc tải lại trang
  rồi cuộn lại (interceptor cần chạy từ đầu trang).
- Trùng lặp: server dedupe theo link ad nên đẩy lại nhiều lần không tạo bản sao.
- Đổi field do FB cập nhật: chỉ cần sửa `mapFacebookAdItem` ở
  `app/src/lib/news/apify-mapper.ts` (server), **không cần build lại extension**.

## File

| File | Vai trò |
|------|---------|
| `manifest.json` | Khai báo MV3, quyền, content scripts |
| `interceptor.js` | World MAIN — hook `fetch`/XHR, bắt JSON ad từ GraphQL |
| `content.js` | World ISOLATED — gom buffer, trả về khi Scan |
| `popup.html` / `popup.js` | Cấu hình + nút Scan + POST về website |
