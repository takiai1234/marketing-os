'use client';

import { createContext, useContext } from 'react';
import { isGuest, type UserRole } from '@/lib/auth/roles';

const RoleContext = createContext<UserRole>('member');

/**
 * Phát role của user hiện tại xuống mọi client component.
 *
 * Dùng để ẩn nút sửa/xoá cho role `guest`. Đây chỉ là lớp trang trí — chốt chặn
 * thật nằm ở src/proxy.ts (chặn mọi POST/PUT/PATCH/DELETE của guest).
 */
export function RoleProvider({
  role,
  children,
}: {
  role: UserRole;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): UserRole {
  return useContext(RoleContext);
}

/** false khi user là Khách (chỉ xem). */
export function useCanEdit(): boolean {
  return !isGuest(useContext(RoleContext));
}
