'use strict';

/**
 * reset-password.cjs
 *
 * Đặt lại mật khẩu cho 1 team_member theo email. Hash bằng bcrypt (cost 10)
 * rồi UPDATE password_hash. CHỈ cập nhật tài khoản đã tồn tại — nếu email
 * không có trong DB sẽ báo lỗi (không tự tạo mới; dùng seed-admin.cjs cho việc đó).
 *
 * Usage:
 *   DATABASE_URL=<chuỗi kết nối> node scripts/reset-password.cjs <email> '<mật khẩu mới>'
 *
 * Ví dụ:
 *   DATABASE_URL=postgres://... node scripts/reset-password.cjs admin@taki.vn 'MatKhauMoi@2026'
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL;
const email = process.argv[2];
const newPassword = process.argv[3];

if (!DATABASE_URL) {
  console.error('[reset-password] Thiếu env DATABASE_URL');
  process.exit(1);
}
if (!email || !newPassword) {
  console.error("[reset-password] Usage: node scripts/reset-password.cjs <email> '<mật khẩu mới>'");
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error('[reset-password] Mật khẩu nên tối thiểu 8 ký tự.');
  process.exit(1);
}

async function resetPassword() {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    const hash = await bcrypt.hash(newPassword, 10);
    const res = await client.query(
      `UPDATE team_member
          SET password_hash = $2
        WHERE lower(email) = lower($1)
        RETURNING id, email, role`,
      [email, hash]
    );
    if (res.rowCount === 0) {
      console.error(`[reset-password] Không tìm thấy tài khoản với email: ${email}`);
      process.exit(1);
    }
    const row = res.rows[0];
    console.log(`[reset-password] Đã đổi mật khẩu cho ${row.email} (role=${row.role}, id=${row.id})`);
  } finally {
    await client.end();
  }
}

resetPassword().catch((err) => {
  console.error('[reset-password] Failed:', err.message);
  process.exit(1);
});
