// Định nghĩa role + ma trận quyền dùng chung cho proxy, page và API route.
// KHÔNG import gì từ 'next/*' hay DB ở đây — file này phải chạy được cả trong
// proxy lẫn client component.

export type UserRole = 'admin' | 'member' | 'guest';

export const USER_ROLES: readonly UserRole[] = ['admin', 'member', 'guest'];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  member: 'Thành viên',
  guest: 'Khách',
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  admin: 'Toàn quyền — quản lý team, cấu hình tích hợp, mọi trang.',
  member: 'Xem + thao tác trên các kênh được gán.',
  guest: 'Chỉ xem. Không thấy Quảng cáo / Landing Pages / Doanh thu / Dashboard Lark.',
};

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

/**
 * Ép giá trị role thô từ DB về union. Giá trị lạ → 'member' (không phải admin,
 * cũng không phải guest) để khớp với cách proxy chỉ chặn đúng chuỗi 'guest'.
 */
export function normalizeRole(value: string | null | undefined): UserRole {
  return isUserRole(value) ? value : 'member';
}

export function isGuest(role: string | null | undefined): boolean {
  return role === 'guest';
}

/**
 * Các nhánh đường dẫn role `guest` không được truy cập — gồm cả trang lẫn API
 * đứng sau trang đó (chặn API để guest không đọc lén dữ liệu qua fetch trực tiếp).
 *
 * `/settings/account` nằm trong danh sách vì guest không được đổi mật khẩu của
 * chính mình — admin phải reset hộ.
 */
export const GUEST_DENIED_PREFIXES: readonly string[] = [
  '/ads',
  '/landing-pages',
  '/revenue',
  '/lark-base',
  '/api/ads',
  '/api/landing-pages',
  '/api/revenue',
  '/api/lark',
  '/settings/account',
  '/api/auth/change-password',
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Ngoại lệ duy nhất được ghi: đăng nhập / đăng xuất. Guest vẫn phải thoát được
 * phiên của mình.
 */
const GUEST_ALLOWED_WRITE_PREFIXES: readonly string[] = [
  '/api/auth/login',
  '/api/auth/logout',
];

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/** Guest có bị cấm xem đường dẫn này không? */
export function isPathDeniedForGuest(pathname: string): boolean {
  return matchesPrefix(pathname, GUEST_DENIED_PREFIXES);
}

/**
 * Guest có bị chặn thao tác ghi này không?
 * Mọi POST/PUT/PATCH/DELETE đều bị chặn (kể cả Server Action — vốn là POST tới
 * chính URL của trang), trừ các đường dẫn trong allowlist.
 */
export function isWriteBlockedForGuest(
  pathname: string,
  method: string
): boolean {
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;
  return !matchesPrefix(pathname, GUEST_ALLOWED_WRITE_PREFIXES);
}
