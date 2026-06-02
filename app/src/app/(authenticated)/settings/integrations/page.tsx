// /settings/integrations — admin manage API keys cho 3rd party services.
// Server component shell — fetch metadata + pass xuống client form.

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { listSettingsMetadata } from '@/lib/settings/api-keys';
import { OPENROUTER_KEY_NAME } from '@/lib/llm/openrouter';
import { OpenRouterKeyForm } from './openrouter-key-form';

export const metadata = {
  title: 'Tích hợp API — Marketing OS',
};

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const role = await getUserRole(user.userId);
  if (role !== 'admin') {
    return (
      <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-5 py-5">
        <h2 className="text-base font-semibold text-amber-900 mb-1">
          Chỉ admin truy cập được trang này
        </h2>
        <p className="text-sm text-amber-800">
          Liên hệ admin để cấu hình API key cho các integration.
        </p>
      </div>
    );
  }

  const [orMeta] = await listSettingsMetadata([OPENROUTER_KEY_NAME]);
  // listSettingsMetadata trả full array các keys requested → first phần tử
  // luôn tồn tại. Local var để TS narrow type.
  const openrouter = orMeta ?? {
    key: OPENROUTER_KEY_NAME,
    isSet: false,
    updatedAt: null,
    updatedByName: null,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-900">Tích hợp API</h3>
        <p className="text-sm text-zinc-500 mt-0.5">
          API key cho các dịch vụ bên ngoài. Encrypted (pgcrypto AES) trước khi
          lưu DB. Chỉ admin set & xem trạng thái.
        </p>
      </div>

      <OpenRouterKeyForm
        initialIsSet={openrouter.isSet}
        initialUpdatedAt={openrouter.updatedAt}
        initialUpdatedByName={openrouter.updatedByName}
        hasEnvFallback={Boolean(process.env[OPENROUTER_KEY_NAME])}
      />

      {/* Future: Stability AI (image), Replicate (video), ... */}
      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-5 py-4 text-xs text-zinc-500 italic">
        Provider khác cho image (Stability / Imagen) + video (Veo / Runway)
        sẽ thêm khi mở rộng Phase 2 + 3. OpenRouter chỉ cover LLM text.
      </div>
    </div>
  );
}
