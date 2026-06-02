// /projects/new — form tạo project mới

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/get-session';
import { NewProjectForm } from './new-project-form';

export const metadata = {
  title: 'Tạo project mới — Marketing OS',
};

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="size-3.5" />
        Quay lại danh sách
      </Link>

      <div>
        <h2 className="text-xl font-bold text-zinc-900">Tạo project mới</h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Đặt tên + paste custom instructions. File knowledge thêm sau ở trang
          chi tiết.
        </p>
      </div>

      <NewProjectForm />
    </div>
  );
}
