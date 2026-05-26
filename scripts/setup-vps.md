# Marketing OS — VPS Setup & Deployment Run Book

Hướng dẫn deploy Marketing OS lên VPS Ubuntu 22.04 từ đầu đến khi live.

---

## Yêu cầu VPS

| Thông số | Tối thiểu | Khuyến nghị |
|----------|-----------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB SSD | 40 GB SSD |
| Network | 100 Mbps | 1 Gbps |

Đảm bảo domain đã trỏ A record về IP của VPS trước khi chạy SSL.

---

## Bước 1 — Cài đặt Docker & Docker Compose

```bash
# Cập nhật package list
sudo apt update && sudo apt upgrade -y

# Cài dependencies
sudo apt install -y ca-certificates curl gnupg lsb-release

# Thêm Docker GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Thêm Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Cài Docker Engine + Compose plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Cho phép user hiện tại chạy docker (không cần sudo)
sudo usermod -aG docker $USER
newgrp docker

# Kiểm tra
docker --version
docker compose version
```

---

## Bước 2 — Cài Certbot (Let's Encrypt)

```bash
sudo apt install -y snapd
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
certbot --version
```

---

## Bước 3 — Clone repository

```bash
sudo mkdir -p /opt/marketing-os
sudo chown $USER:$USER /opt/marketing-os
cd /opt/marketing-os

# Clone từ GitHub (thay URL bằng repo thực)
git clone https://github.com/<org>/marketing-os.git .
```

---

## Bước 4 — Tạo file môi trường production

```bash
cd /opt/marketing-os

# Copy template
cp .env.production.example .env.production

# Chỉnh quyền: chỉ root đọc được
chmod 600 .env.production
sudo chown root:root .env.production

# Mở editor và điền đầy đủ các giá trị
sudo nano .env.production
```

### Các giá trị cần điền:

| Biến | Cách tạo |
|------|----------|
| `DB_PASSWORD` | `openssl rand -base64 32` |
| `SESSION_PASSWORD` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `FB_APP_ID` / `FB_APP_SECRET` | Lấy từ Meta Developer Console |
| `DOMAIN` | Domain đã trỏ A record về VPS (VD: `marketing.example.com`) |
| `ADMIN_EMAIL` | Email đăng nhập admin |
| `ADMIN_PASSWORD_HASH` | Xem bước 6 |

### Cập nhật DATABASE_URL:

Sau khi điền `DB_USER`, `DB_PASSWORD`, `DB_NAME`, cập nhật:
```
DATABASE_URL=postgresql://<DB_USER>:<DB_PASSWORD>@postgres:5432/<DB_NAME>
```

---

## Bước 5 — Thay thế DOMAIN trong nginx config

```bash
# Thay ${DOMAIN} bằng domain thực (VD: marketing.example.com)
DOMAIN="marketing.example.com"
sed -i "s/\${DOMAIN}/${DOMAIN}/g" /opt/marketing-os/nginx/sites/marketing-os.conf
```

---

## Bước 6 — Tạo ADMIN_PASSWORD_HASH

Khởi động postgres trước để app container có thể chạy được:

```bash
cd /opt/marketing-os

# Khởi động chỉ postgres
docker compose up -d postgres

# Đợi postgres healthy (khoảng 15 giây)
docker compose ps

# Tạo bcrypt hash cho mật khẩu admin
# Thay "YourStrongPassword!" bằng mật khẩu thực
docker compose run --rm app node -e "
const b = require('bcryptjs');
b.hash('YourStrongPassword!', 12).then(h => { console.log(h); process.exit(0); });
"
```

Copy giá trị hash vào `ADMIN_PASSWORD_HASH` trong `.env.production`.

---

## Bước 7 — Lấy SSL certificate (Let's Encrypt)

### 7a. Khởi động nginx trên cổng 80 trước

Nginx cần chạy để certbot xác thực domain qua HTTP challenge:

```bash
cd /opt/marketing-os

# Khởi động nginx (chưa cần app)
docker compose up -d nginx
```

Kiểm tra nginx đang lắng nghe:
```bash
curl -I http://<your-domain>/
# Phải trả 301 redirect (vì chưa có SSL)
```

### 7b. Chạy certbot

```bash
sudo certbot certonly \
  --webroot \
  --webroot-path /opt/marketing-os/certbot-www \
  --email <ADMIN_EMAIL> \
  --agree-tos \
  --no-eff-email \
  -d <your-domain>
```

> Lưu ý: `/opt/marketing-os/certbot-www` là path trên host — được mount vào nginx container tại `/var/www/certbot`.
> Thực ra certbot-www là Docker volume. Để webroot hoạt động đúng, có thể dùng cách thay thế:

```bash
# Cách thay thế dùng standalone mode (dừng nginx trước)
docker compose stop nginx
sudo certbot certonly --standalone -d <your-domain> --email <ADMIN_EMAIL> --agree-tos --no-eff-email
docker compose start nginx
```

Cert được lưu tại `/etc/letsencrypt/live/<domain>/`.

### 7c. Mount cert vào Docker volume

Certbot lưu cert tại `/etc/letsencrypt` trên host. Volume `certbot-etc` cần trỏ vào đây.

Sửa `docker-compose.yml` — phần nginx volumes, thêm bind mount:
```yaml
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/sites:/etc/nginx/conf.d:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro        # bind mount từ host
      - certbot-www:/var/www/certbot:ro
```

Hoặc copy cert vào volume certbot-etc sau khi tạo xong.

---

## Bước 8 — Khởi động toàn bộ stack

```bash
cd /opt/marketing-os

# Build image app
docker compose build app

# Khởi động tất cả service
docker compose up -d

# Xem logs
docker compose logs -f
```

Kiểm tra trạng thái:
```bash
docker compose ps
# postgres, app, nginx đều phải ở trạng thái "running" / "healthy"
```

---

## Bước 9 — Kiểm tra deployment

```bash
# Kiểm tra HTTPS
curl -I https://<your-domain>/

# Phải trả: HTTP/2 307 (redirect về /login) hoặc 200

# Kiểm tra login page
curl -L https://<your-domain>/login
```

Mở browser: `https://<your-domain>/login` → đăng nhập bằng `ADMIN_EMAIL` + mật khẩu đã tạo hash.

---

## Bước 10 — Cấu hình backup tự động

```bash
# Tạo thư mục backup
sudo mkdir -p /backup
sudo chmod 755 /backup

# Thêm quyền thực thi cho script
chmod +x /opt/marketing-os/scripts/backup-postgres.sh

# Thêm cron job — chạy lúc 04:00 mỗi ngày
(crontab -l 2>/dev/null; echo "0 4 * * * /opt/marketing-os/scripts/backup-postgres.sh >> /var/log/marketing-os-backup.log 2>&1") | crontab -

# Xem crontab đã lưu
crontab -l
```

Test backup thủ công:
```bash
/opt/marketing-os/scripts/backup-postgres.sh
ls -lh /backup/
```

---

## Bước 11 — Auto-renew SSL certificate

Certbot đã tự cài systemd timer khi cài qua snap. Kiểm tra:

```bash
sudo systemctl status snap.certbot.renew.timer

# Test dry-run
sudo certbot renew --dry-run
```

Nếu dùng standalone mode ở bước 7, cần dừng nginx trước khi renew:

```bash
# Thêm pre/post hook để dừng/khởi lại nginx
sudo nano /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh
```
```sh
#!/bin/sh
cd /opt/marketing-os && docker compose stop nginx
```
```bash
sudo nano /etc/letsencrypt/renewal-hooks/post/start-nginx.sh
```
```sh
#!/bin/sh
cd /opt/marketing-os && docker compose start nginx
```
```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/post/start-nginx.sh
```

---

## Bước 12 — Cấu hình Facebook OAuth cho production

1. Vào [Meta Developer Console](https://developers.facebook.com/)
2. Chọn App → Settings → Basic → copy `App ID` và `App Secret` vào `.env.production`
3. Vào Facebook Login → Settings → Valid OAuth Redirect URIs:
   - Thêm: `https://<your-domain>/api/auth/fb/callback`
4. Restart app container:
   ```bash
   docker compose restart app
   ```

---

## Lệnh vận hành thường ngày

### Xem logs

```bash
# Tất cả service
docker compose logs -f

# Chỉ app
docker compose logs -f app

# Chỉ nginx
docker compose logs -f nginx
```

### Restart service

```bash
docker compose restart app
docker compose restart nginx
```

### Cập nhật code mới

```bash
cd /opt/marketing-os
git pull

# Rebuild và restart app (zero-downtime: nginx buffer requests trong vài giây)
docker compose build app
docker compose up -d app
```

### Xem healthcheck

```bash
docker inspect --format='{{json .State.Health}}' marketing_os_app | python3 -m json.tool
```

### Rollback migration

```bash
# Chạy trong container app
docker compose run --rm app npm run db:rollback
```

### Restore từ backup

```bash
# Dừng app trước
docker compose stop app

chmod +x /opt/marketing-os/scripts/restore-postgres.sh
/opt/marketing-os/scripts/restore-postgres.sh /backup/2025-05-01.sql.gz

# Khởi động lại app (migrations sẽ chạy lại — idempotent)
docker compose start app
```

---

## Troubleshooting

### App không start — kiểm tra logs

```bash
docker compose logs app --tail=50
```

### Migration fail

```bash
# Xem migration nào đã chạy
docker compose exec postgres psql -U $DB_USER $DB_NAME -c "SELECT * FROM pgmigrations;"

# Chạy migration thủ công
docker compose run --rm app node scripts/run-migrations.cjs
```

### Nginx 502 Bad Gateway

App chưa start hoặc crash. Kiểm tra:
```bash
docker compose ps
docker compose logs app --tail=20
```

### Cert expired / SSL error

```bash
sudo certbot renew --force-renewal
docker compose restart nginx
```

### Disk đầy

```bash
df -h
# Xóa Docker images cũ
docker image prune -a
# Xóa backup cũ nếu cần
ls -lh /backup/
```

---

## Checklist sau deploy

- [ ] `https://<domain>` load được, cert hợp lệ (xanh lá trên browser)
- [ ] Đăng nhập admin thành công
- [ ] Kết nối 1 Facebook Page thử nghiệm
- [ ] Cron jobs log đúng trong `docker compose logs app`
- [ ] Backup tạo file `/backup/YYYY-MM-DD.sql.gz`
- [ ] Restore test từ backup thành công
- [ ] `certbot renew --dry-run` pass
- [ ] FB OAuth redirect URI HTTPS hoạt động

---

## Post-MVP (không thuộc scope MVP)

- Load balancer + instance thứ 2 nếu cần scale
- S3/rclone backup offsite hàng tuần
- Sentry error tracking
- Plausible analytics
- BullMQ + Redis nếu cron overload
