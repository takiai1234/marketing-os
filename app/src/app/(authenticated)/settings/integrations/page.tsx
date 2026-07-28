// /settings/integrations — admin manage API keys cho 3rd party services.
// Server component shell — fetch metadata + pass xuống client form.

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-session';
import { getUserRole } from '@/lib/auth/get-role';
import { listSettingsMetadata, getSetting } from '@/lib/settings/api-keys';
import { OPENROUTER_KEY_NAME } from '@/lib/llm/openrouter';
import { KIE_AI_KEY_NAME } from '@/lib/llm/kie-ai';
import { FB_APP_ID_KEY, FB_APP_SECRET_KEY } from '@/lib/fb/oauth-flow';
import { GOOGLE_CLIENT_ID_KEY, GOOGLE_CLIENT_SECRET_KEY, isGoogleConnected } from '@/lib/google/oauth';
import { OpenRouterKeyForm } from './openrouter-key-form';
import { KieAiKeyForm } from './kieai-key-form';
import { FacebookAppForm } from './facebook-app-form';
import { ApifyForm } from './apify-form';
import { AdsTokenForm } from './ads-token-form';
import { GoogleAnalyticsForm } from './google-analytics-form';
import { LarkAppForm } from './lark-form';
import { LarkBaseForm } from './lark-base-form';
import { TelegramForm } from './telegram-form';
import { TELEGRAM_BOT_TOKEN_KEY, TELEGRAM_CHAT_ID_KEY } from '@/app/api/settings/telegram/route';
import { LARK_APP_ID_KEY, LARK_APP_SECRET_KEY } from '@/lib/lark/client';
import {
  LARK_BASE_MARKETING_APP_TOKEN_KEY, LARK_BASE_MARKETING_TABLE_ID_KEY,
  LARK_BASE_ORDER_APP_TOKEN_KEY,     LARK_BASE_ORDER_TABLE_ID_KEY,
} from '@/lib/lark/base-client';

export const metadata = {
  title: 'Tích hợp API — Marketing OS',
};

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function IntegrationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
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

  const [orMeta, kieMeta, fbIdMeta, fbSecretMeta, apifyTokenMeta, adsTokenMeta, googleIdMeta, googleSecretMeta,
         larkAppIdMeta, larkAppSecretMeta,
         larkMktAppTokenMeta, larkMktTableIdMeta, larkOrderAppTokenMeta, larkOrderTableIdMeta,
         telegramBotTokenMeta, telegramChatIdMeta] =
    await listSettingsMetadata([
      OPENROUTER_KEY_NAME,
      KIE_AI_KEY_NAME,
      FB_APP_ID_KEY,
      FB_APP_SECRET_KEY,
      'APIFY_API_TOKEN',
      'ADS_INGEST_TOKEN',
      GOOGLE_CLIENT_ID_KEY,
      GOOGLE_CLIENT_SECRET_KEY,
      LARK_APP_ID_KEY,
      LARK_APP_SECRET_KEY,
      LARK_BASE_MARKETING_APP_TOKEN_KEY,
      LARK_BASE_MARKETING_TABLE_ID_KEY,
      LARK_BASE_ORDER_APP_TOKEN_KEY,
      LARK_BASE_ORDER_TABLE_ID_KEY,
      TELEGRAM_BOT_TOKEN_KEY,
      TELEGRAM_CHAT_ID_KEY,
    ]);
  // Load plaintext Apify lists (not secret — hiển thị OK trong UI)
  const [googleConnected, twitterHandles, facebookPages, twitterActor, facebookActor] = await Promise.all([
    isGoogleConnected().catch(() => false),
    getSetting('APIFY_TWITTER_HANDLES'),
    getSetting('APIFY_FACEBOOK_PAGES'),
    getSetting('APIFY_TWITTER_ACTOR'),
    getSetting('APIFY_FACEBOOK_ACTOR'),
  ]);
  const openrouter = orMeta ?? {
    key: OPENROUTER_KEY_NAME,
    isSet: false,
    updatedAt: null,
    updatedByName: null,
  };
  const kieai = kieMeta ?? {
    key: KIE_AI_KEY_NAME,
    isSet: false,
    updatedAt: null,
    updatedByName: null,
  };
  const fbAppId = fbIdMeta ?? {
    key: FB_APP_ID_KEY,
    isSet: false,
    updatedAt: null,
    updatedByName: null,
  };
  const fbAppSecret = fbSecretMeta ?? {
    key: FB_APP_SECRET_KEY,
    isSet: false,
    updatedAt: null,
    updatedByName: null,
  };
  // env "placeholder" string = treat as not set (giống logic ở /ads/connect)
  const envFbAppId = process.env[FB_APP_ID_KEY];
  const envFbAppSecret = process.env[FB_APP_SECRET_KEY];
  const fbHasEnvFallback = Boolean(
    envFbAppId &&
      envFbAppId !== 'placeholder' &&
      envFbAppSecret &&
      envFbAppSecret !== 'placeholder'
  );

  const googleConnectError = sp.google_error ? decodeURIComponent(sp.google_error) : undefined;
  const googleConnectSuccess = sp.google_connected === '1';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-900">Tích hợp API</h3>
        <p className="text-sm text-zinc-500 mt-0.5">
          API key cho các dịch vụ bên ngoài. Encrypted (pgcrypto AES) trước khi
          lưu DB. Chỉ admin set & xem trạng thái.
        </p>
      </div>

      <FacebookAppForm
        appIdIsSet={fbAppId.isSet}
        secretIsSet={fbAppSecret.isSet}
        appIdUpdatedAt={fbAppId.updatedAt}
        appIdUpdatedByName={fbAppId.updatedByName}
        hasEnvFallback={fbHasEnvFallback}
      />

      <OpenRouterKeyForm
        initialIsSet={openrouter.isSet}
        initialUpdatedAt={openrouter.updatedAt}
        initialUpdatedByName={openrouter.updatedByName}
        hasEnvFallback={Boolean(process.env[OPENROUTER_KEY_NAME])}
      />

      <KieAiKeyForm
        initialIsSet={kieai.isSet}
        initialUpdatedAt={kieai.updatedAt}
        initialUpdatedByName={kieai.updatedByName}
        hasEnvFallback={Boolean(process.env[KIE_AI_KEY_NAME])}
      />

      <ApifyForm
        apiTokenIsSet={apifyTokenMeta?.isSet ?? false}
        twitterHandles={twitterHandles ?? ''}
        facebookPages={facebookPages ?? ''}
        twitterActor={twitterActor ?? ''}
        facebookActor={facebookActor ?? ''}
        updatedAt={apifyTokenMeta?.updatedAt ?? null}
        updatedByName={apifyTokenMeta?.updatedByName ?? null}
      />

      <GoogleAnalyticsForm
        clientIdIsSet={googleIdMeta?.isSet ?? Boolean(process.env[GOOGLE_CLIENT_ID_KEY])}
        clientSecretIsSet={googleSecretMeta?.isSet ?? Boolean(process.env[GOOGLE_CLIENT_SECRET_KEY])}
        isConnected={googleConnected}
        connectError={googleConnectError}
        connectSuccess={googleConnectSuccess}
      />

      <AdsTokenForm
        initialIsSet={adsTokenMeta?.isSet ?? false}
        initialUpdatedAt={adsTokenMeta?.updatedAt ?? null}
        initialUpdatedByName={adsTokenMeta?.updatedByName ?? null}
        hasEnvFallback={Boolean(process.env.ADS_INGEST_TOKEN)}
      />

      <LarkAppForm
        initialAppIdIsSet={larkAppIdMeta?.isSet ?? false}
        initialAppSecretIsSet={larkAppSecretMeta?.isSet ?? false}
        initialUpdatedAt={larkAppIdMeta?.updatedAt ?? null}
      />

      <LarkBaseForm
        marketing={{ isSet: (larkMktAppTokenMeta?.isSet ?? false) && (larkMktTableIdMeta?.isSet ?? false), updatedAt: larkMktAppTokenMeta?.updatedAt ?? null }}
        order={{ isSet: (larkOrderAppTokenMeta?.isSet ?? false) && (larkOrderTableIdMeta?.isSet ?? false), updatedAt: larkOrderAppTokenMeta?.updatedAt ?? null }}
        larkAppConfigured={(larkAppIdMeta?.isSet ?? false) && (larkAppSecretMeta?.isSet ?? false)}
      />

      <TelegramForm
        initialBotTokenIsSet={telegramBotTokenMeta?.isSet ?? false}
        initialChatIdIsSet={telegramChatIdMeta?.isSet ?? false}
        initialUpdatedAt={telegramBotTokenMeta?.updatedAt ?? null}
      />

      <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 px-5 py-4 text-xs text-zinc-500 italic">
        <strong>9Router</strong> cho Chat LLM (Claude Max + ChatGPT Pro) ·{' '}
        <strong>kie.ai</strong> cho Tạo ảnh + Tạo video ·{' '}
        <strong>Apify</strong> cho pull Twitter/Facebook vào /news. Mỗi feature
        1 key riêng — fail provider này không ảnh hưởng provider kia.
      </div>
    </div>
  );
}
