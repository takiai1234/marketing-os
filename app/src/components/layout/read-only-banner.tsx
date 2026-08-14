import { EyeIcon } from 'lucide-react';

/** Nhắc user role `guest` rằng họ đang ở chế độ chỉ xem. */
export function ReadOnlyBanner() {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-amber-50 px-4 py-2.5 ring-1 ring-amber-200">
      <EyeIcon className="size-4 shrink-0 mt-0.5 text-amber-700" />
      <p className="text-sm text-amber-900">
        <span className="font-semibold">Chế độ chỉ xem.</span>{' '}
        Tài khoản Khách không thể tạo, sửa hay xoá dữ liệu. Liên hệ admin nếu bạn
        cần thêm quyền.
      </p>
    </div>
  );
}
