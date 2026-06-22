# FB Ads + Web Clip → Marketing OS (Chrome extension)

Hai tính năng, đẩy thẳng về Marketing OS (tab **Tin tức AI**), **miễn phí**:

1. **Quét Facebook Ads Library** — hook GraphQL của trang Ads Library → lấy JSON
   ad có cấu trúc → POST `/api/news/ingest-ads` (badge "FB Ads").
2. **Clip trang web bất kỳ** — mở 1 trang bất kỳ, bấm Clip → lấy tiêu đề + ảnh +
   nội dung → POST `/api/news/ingest-web` (badge "Web").

```
[FB Ads]  facebook.com/ads/library → cuộn nạp ad → Scan → badge "FB Ads"
[Clip]    bất kỳ trang web nào → bấm "Clip trang đang mở" → badge "Web"
```

Cả hai dùng chung 1 token (ADS_INGEST_TOKEN). Server dedupe theo link.

---

## 1. Lấy token (1 lần)

Cần một `ADS_INGEST_TOKEN` — chuỗi bí mật để xác thực extension.

**Cách dễ nhất — qua giao diện web (khuyên dùng):**

1. Đăng nhập website bằng tài khoản **admin**.
2. Vào **Settings → Tích hợp API** (`/settings/integrations`).
3. Tới khối **"Token quét FB Ads"** → bấm **Tạo token**.
4. Bấm **Copy**. Xong — không cần đụng server, không cần restart.

**Cách thủ công — qua env** (nếu không muốn dùng UI):

```bash
# Sinh token:
openssl rand -hex 24
# Thêm vào app/.env (dev) hoặc .env.production (prod) rồi restart app:
ADS_INGEST_TOKEN="...token..."
```

> Route `/api/news/ingest-ads` được loại trừ khỏi proxy auth nên gọi được mà
> không cần đăng nhập; bảo mật dựa hoàn toàn vào token này. Giữ token bí mật,
> không commit lên GitHub.

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
