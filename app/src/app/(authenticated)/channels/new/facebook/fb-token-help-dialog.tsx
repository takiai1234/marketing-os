'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BookOpenIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  ChevronRightIcon,
} from 'lucide-react';

/**
 * Popup hướng dẫn chi tiết cách lấy Page ID + Page Name + Page Access Token
 * từ Graph API Explorer.
 *
 * Trigger: nút "Hướng dẫn chi tiết" trong ManualConnectForm.
 * Dùng cùng pattern Dialog của shadcn/ui (Base UI bên dưới).
 */
export function FbTokenHelpDialog() {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'gap-1.5 text-xs h-7 px-2.5'
        )}
      >
        <BookOpenIcon className="size-3.5" />
        Hướng dẫn chi tiết
      </DialogTrigger>

      <DialogContent className="w-full sm:max-w-3xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle className="text-base break-words">
            Lấy 3 thông tin từ Graph API Explorer
          </DialogTitle>
          <p className="text-xs text-zinc-500 mt-1 break-words">
            Page ID · Page Name · Page Access Token — copy lại để dán vào form
            bên trái.
          </p>
        </DialogHeader>

        <div className="flex flex-col gap-5 text-sm min-w-0">
          {/* Requirements section */}
          <section className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs">
            <div className="font-semibold text-amber-900 mb-1">
              Bạn cần có sẵn
            </div>
            <ul className="list-disc list-inside text-amber-800 space-y-0.5">
              <li>Tài khoản Facebook cá nhân là <strong>Admin / Editor</strong> của Page muốn kết nối</li>
              <li>1 Meta App đã tạo ở{' '}
                <ExternalLink href="https://developers.facebook.com/apps/">
                  developers.facebook.com/apps
                </ExternalLink>{' '}
                (App nào cũng được, kể cả app cá nhân)
              </li>
            </ul>
          </section>

          <Step
            num={1}
            title="Mở Graph API Explorer"
            body={
              <>
                <p className="text-zinc-600">
                  Vào trang Graph API Explorer của Meta:
                </p>
                <LinkBox href="https://developers.facebook.com/tools/explorer/" />
                <p className="text-xs text-zinc-500">
                  Đây là công cụ chính thức của Meta để test query Facebook
                  Graph API + sinh token tạm thời.
                </p>
              </>
            }
          />

          <Step
            num={2}
            title="Chọn Meta App ở góc trên bên phải"
            body={
              <>
                <p className="text-zinc-600">
                  Dropdown <strong>“Meta App”</strong> ở thanh phải. Chọn App
                  của bạn. Nếu chưa có:
                </p>
                <ul className="list-disc list-inside text-xs text-zinc-600 space-y-0.5 ml-1">
                  <li>
                    Vào{' '}
                    <ExternalLink href="https://developers.facebook.com/apps/creation/">
                      Create New App
                    </ExternalLink>
                  </li>
                  <li>Chọn type: <strong>Business</strong></li>
                  <li>Đặt tên bất kỳ, hoàn tất → quay lại Graph Explorer</li>
                </ul>
              </>
            }
          />

          <Step
            num={3}
            title="Sinh User Access Token với 3 quyền cần thiết"
            body={
              <>
                <p className="text-zinc-600">
                  Ở thanh phải dưới <strong>“User or Page”</strong>, đảm bảo
                  đang là <strong>User Token</strong> (KHÔNG phải Page Token —
                  bước này lấy User Token để query danh sách Page).
                </p>

                {/* ─── PHẦN A — Add a Permission trong Graph Explorer ─── */}
                <div className="rounded-md border-2 border-blue-300 bg-blue-50/50 px-3 py-2.5 text-xs">
                  <div className="font-bold text-blue-900 mb-1 flex items-center gap-1.5">
                    <span className="inline-flex size-4 items-center justify-center rounded-full bg-blue-600 text-white text-[10px]">
                      A
                    </span>
                    Bấm <em>Add a Permission</em> và tick 3 permission:
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    <PermissionPill>pages_show_list</PermissionPill>
                    <PermissionPill>pages_read_engagement</PermissionPill>
                    <PermissionPill>pages_read_user_content</PermissionPill>
                  </div>
                  <ul className="text-zinc-600 space-y-0.5 list-disc list-inside leading-snug">
                    <li>
                      <code className="bg-white px-1 rounded">pages_show_list</code>{' '}
                      — liệt kê page bạn quản lý
                    </li>
                    <li>
                      <code className="bg-white px-1 rounded">pages_read_engagement</code>{' '}
                      — đọc reach / impressions / clicks
                    </li>
                    <li>
                      <code className="bg-white px-1 rounded">pages_read_user_content</code>{' '}
                      — đọc comments / reactions trên bài viết
                    </li>
                  </ul>
                </div>

                <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-900">
                  ⚠ Nếu dropdown không hiện <code>pages_read_user_content</code>:{' '}
                  gõ thẳng tên permission vào ô search trên dropdown. Vẫn không
                  hiện → mở App Dashboard → <strong>App Review → Permissions
                  and Features</strong> → search → bấm <strong>Get advanced
                  access</strong> (Dev mode tự auto-grant).
                </div>

                {/* ─── PHẦN B — Popup OAuth Facebook (chỗ hay bỏ sót) ─── */}
                <div className="rounded-md border-2 border-rose-300 bg-rose-50/50 px-3 py-2.5 text-xs">
                  <div className="font-bold text-rose-900 mb-1 flex items-center gap-1.5">
                    <span className="inline-flex size-4 items-center justify-center rounded-full bg-rose-600 text-white text-[10px]">
                      B
                    </span>
                    Bấm{' '}
                    <strong className="text-blue-700">
                      Generate Access Token
                    </strong>{' '}
                    → popup OAuth Facebook hiện ra
                  </div>
                  <div className="text-rose-900 mb-1.5">
                    🚨 <strong>Bước hay bỏ sót:</strong> Popup show permissions
                    theo NHÓM CHA. Phải tick 2 nhóm cha sau, sub-permission ở
                    Phần A mới được apply:
                  </div>
                  <ul className="space-y-1.5 ml-1">
                    <li className="flex items-start gap-1.5">
                      <span className="text-rose-600 font-bold shrink-0">☑</span>
                      <div>
                        <code className="bg-white px-1 rounded font-mono">
                          Tạo và quản lý quảng cáo bằng API Marketing
                        </code>
                        <div className="text-zinc-600 text-[11px]">
                          → unlock <code>pages_show_list</code>
                          {' + '}
                          <code>ads_*</code> (nhóm advertising)
                        </div>
                      </div>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-rose-600 font-bold shrink-0">☑</span>
                      <div>
                        <code className="bg-white px-1 rounded font-mono">
                          Quản lý mọi thứ trên Trang
                        </code>
                        <div className="text-zinc-600 text-[11px]">
                          → unlock <code>pages_read_engagement</code>
                          {' + '}
                          <code>pages_read_user_content</code>
                          {' + '}
                          các quyền page khác
                        </div>
                      </div>
                    </li>
                  </ul>
                  <div className="text-rose-900 mt-2 text-[11px] italic">
                    Không tick nhóm cha → permission con bị xám / silently bị
                    bỏ → token sinh ra thiếu scope → sync fail với lỗi (#10).
                  </div>
                </div>

                <p className="text-zinc-600">
                  Sau khi tick đủ 2 nhóm cha → bấm{' '}
                  <strong>Continue / Done</strong> → chọn page muốn cấp quyền
                  (nếu có hỏi <em>Edit access</em>, tick page cụ thể) →{' '}
                  <strong>Done</strong>.
                </p>

                <div className="rounded-md bg-blue-50 border border-blue-200 px-2.5 py-1.5 text-xs text-blue-900">
                  💡 Token vừa sinh nằm trong ô <strong>Access Token</strong>{' '}
                  phía trên — đây là <strong>User Token short-lived</strong>{' '}
                  (sống ~1-2 giờ). Bước 4 dùng nó để query{' '}
                  <code>/me/accounts</code>. Muốn token sống lâu/vĩnh viễn →
                  xem section <strong>"Gia hạn token"</strong> bên dưới sau
                  Bước 5.
                </div>
              </>
            }
          />

          <Step
            num={4}
            title="Chạy query lấy danh sách Page"
            body={
              <>
                <p className="text-zinc-600">
                  Ở ô URL query (giữa màn hình), đảm bảo method là{' '}
                  <strong>GET</strong>. Xoá nội dung cũ, paste:
                </p>

                <CopyableCode value="/me/accounts?fields=id,name,access_token" />

                <p className="text-zinc-600">
                  Bấm nút <strong className="text-blue-700">Submit</strong> bên
                  phải.
                </p>

                <p className="text-xs text-zinc-500">
                  Response JSON sẽ có dạng:
                </p>

                <pre className="rounded-md bg-zinc-900 text-zinc-100 text-[11px] p-3 overflow-x-auto font-mono leading-relaxed">
{`{
  "data": [
    {
      "access_token": "EAAxxx...",        ← Page Access Token
      "name": "TAKI Travel",              ← Page Name
      "id": "1234567890",                 ← Page ID
      "category": "Travel Company",
      "tasks": ["ANALYZE","ADVERTISE",...]
    },
    {
      "access_token": "EAAyyy...",
      "name": "TAKI Academy",
      "id": "9876543210",
      ...
    }
  ]
}`}
                </pre>
              </>
            }
          />

          <Step
            num={5}
            title="Copy 3 giá trị của page muốn kết nối"
            body={
              <>
                <p className="text-zinc-600">
                  Mỗi item trong <code>data[]</code> là 1 page bạn quản lý. Tìm
                  page muốn kết nối → copy 3 field:
                </p>

                <div className="rounded-md border border-zinc-200">
                  <div className="grid grid-cols-[140px_1fr] text-xs">
                    <FieldRow
                      label="id"
                      desc="→ paste vào ô Page ID"
                      example="1234567890"
                    />
                    <FieldRow
                      label="name"
                      desc="→ paste vào ô Tên page (có thể tự đổi)"
                      example="TAKI Travel"
                    />
                    <FieldRow
                      label="access_token"
                      desc="→ paste vào ô Page Access Token"
                      example="EAAxxx... (dài ~200 ký tự)"
                      isLast
                    />
                  </div>
                </div>

                <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-xs text-emerald-900">
                  ✓ Quay về form, paste 3 giá trị → bấm{' '}
                  <strong>Kiểm tra token</strong> để verify → bấm{' '}
                  <strong>Kết nối page</strong> để lưu.
                </div>
              </>
            }
          />

          {/* ─── Bonus: Gia hạn token vĩnh viễn ─────────────────────── */}
          <section className="border-t pt-4 mt-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex size-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold shrink-0">
                ★
              </div>
              <h3 className="text-sm font-semibold text-zinc-900">
                Bonus — Gia hạn token để sống vĩnh viễn (khuyên dùng)
              </h3>
            </div>
            <p className="text-xs text-zinc-600 mb-2.5">
              Page Token vừa lấy ở Bước 5 chỉ sống <strong>~1-2 giờ</strong>{' '}
              vì nó kế thừa từ User Token short-lived. Marketing OS sẽ fail
              sync sau đó. Đổi sang token <strong>vĩnh viễn</strong> qua 2
              bước nhỏ — chỉ làm 1 lần, dùng mãi.
            </p>

            <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-xs">
              <div className="font-bold text-emerald-900 mb-1.5">
                Cách 1 — Access Token Tool (dễ nhất, không cần code)
              </div>
              <ol className="list-decimal list-inside space-y-1 text-zinc-700 leading-relaxed">
                <li>
                  Mở{' '}
                  <ExternalLink href="https://developers.facebook.com/tools/debug/accesstoken/">
                    Access Token Debugger
                  </ExternalLink>
                </li>
                <li>
                  Paste User Token short-lived (token User ở Bước 3, KHÔNG
                  phải Page Token) → bấm <strong>Debug</strong>
                </li>
                <li>
                  Cuộn xuống cuối trang → bấm{' '}
                  <strong className="text-blue-700">
                    Extend Access Token
                  </strong>
                </li>
                <li>
                  FB hỏi confirm + nhập mật khẩu FB → trả về{' '}
                  <strong>User Token long-lived (60 ngày)</strong> ở ô{' '}
                  <em>New Access Token</em>
                </li>
                <li>
                  Copy long-lived User Token này → quay lại Graph Explorer →
                  paste vào ô Access Token → chạy lại{' '}
                  <code className="bg-white px-1 rounded">
                    /me/accounts?fields=id,name,access_token
                  </code>
                </li>
                <li>
                  Page Token trả về lần này = <strong>vĩnh viễn</strong> (FB
                  không set expiry cho Page Token khi source User Token đã
                  long-lived). Paste vào Marketing OS form.
                </li>
              </ol>
            </div>

            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs mt-2">
              <div className="font-bold text-zinc-900 mb-1.5">
                Cách 2 — qua curl (dành cho dev, automate được)
              </div>
              <p className="text-zinc-600 mb-1">
                Chạy lệnh sau trong terminal — thay 3 placeholder:
              </p>
              <CopyableCode value="curl -G 'https://graph.facebook.com/v25.0/oauth/access_token' -d 'grant_type=fb_exchange_token' -d 'client_id=YOUR_APP_ID' -d 'client_secret=YOUR_APP_SECRET' -d 'fb_exchange_token=SHORT_LIVED_USER_TOKEN'" />
              <ul className="text-zinc-600 mt-1.5 space-y-0.5 list-disc list-inside leading-snug">
                <li>
                  <code>YOUR_APP_ID</code> + <code>YOUR_APP_SECRET</code>: ở
                  App Dashboard → Settings → Basic
                </li>
                <li>
                  <code>SHORT_LIVED_USER_TOKEN</code>: User Token ở Bước 3
                </li>
              </ul>
              <p className="text-zinc-500 mt-1.5 text-[11px]">
                Trả về JSON{' '}
                <code className="bg-white px-1 rounded">
                  {`{"access_token": "<long-lived>", "expires_in": 5184000}`}
                </code>{' '}
                (60 ngày). Dùng nó query <code>/me/accounts</code> để lấy
                Page Token vĩnh viễn.
              </p>
            </div>

            <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-900 mt-2">
              ⚠ <strong>App Secret là bí mật</strong> — không paste vào ChatGPT,
              không commit lên Git, không share screen. Nếu lộ → vào App
              Dashboard → Settings → Basic → bấm <strong>Show</strong> bên
              cạnh App Secret → <strong>Reset</strong>.
            </div>

            <div className="rounded-md bg-emerald-50 border border-emerald-300 px-2.5 py-2 text-xs text-emerald-900 mt-2 font-medium">
              ✅ Sau khi đổi xong: Page Token mới <strong>không có expiry
              date</strong>. Marketing OS sync chạy mãi mãi (trừ khi bạn
              revoke quyền hoặc bị xoá khỏi page).
            </div>
          </section>

          {/* FAQ section */}
          <section className="border-t pt-4 mt-1">
            <h3 className="text-sm font-semibold text-zinc-900 mb-2">
              Câu hỏi thường gặp
            </h3>

            <Faq question="Token này dùng được bao lâu?">
              <p>
                <strong>Mặc định: ~1-2 giờ.</strong> Cả User Token (Graph
                Explorer) lẫn Page Token sinh ra từ nó đều short-lived. Sau
                đó Marketing OS gọi sync sẽ fail{' '}
                <code>"OAuthException (code 190)"</code>.
              </p>
              <p className="mt-1">
                Để token sống <strong>60 ngày → vĩnh viễn</strong>: làm theo
                section{' '}
                <strong className="text-emerald-700">
                  "Gia hạn token vĩnh viễn"
                </strong>{' '}
                bên trên (chỉ cần làm 1 lần — extend User Token short-lived
                thành long-lived, query lại <code>/me/accounts</code> → Page
                Token mới không có expiry).
              </p>
              <p className="mt-1 text-zinc-500">
                Khi nào token vẫn fail mặc dù đã long-lived: bạn bị xoá khỏi
                Page (mất role), hoặc admin Meta App revoke quyền, hoặc đổi
                mật khẩu FB (đôi khi triggers revoke).
              </p>
            </Faq>

            <Faq question="Lỗi (#10) 'requires pages_read_engagement permission' — nhưng tôi đã có quyền đó rồi?">
              <p>
                Đây là <strong>message gây hiểu nhầm của Facebook</strong>.
                Thực ra bạn thiếu{' '}
                <code className="bg-white px-1 rounded font-mono">
                  pages_read_user_content
                </code>
                , không phải <code className="bg-white px-1 rounded font-mono">pages_read_engagement</code>.
              </p>
              <p className="mt-1">
                FB trả về (#10) cho 2 trường hợp khác nhau với cùng 1 message:
              </p>
              <ul className="list-disc list-inside ml-1 mt-0.5 space-y-0.5">
                <li>
                  Đọc <code>insights.metric(...)</code> → cần{' '}
                  <code>pages_read_engagement</code>
                </li>
                <li>
                  Đọc <code>comments.summary(true)</code> hoặc{' '}
                  <code>reactions.summary(true)</code> → cần{' '}
                  <code>pages_read_user_content</code> (nhưng FB vẫn báo "requires pages_read_engagement")
                </li>
              </ul>
              <p className="mt-1">
                Fix: quay lại Bước 3, tick thêm{' '}
                <code className="bg-white px-1 rounded">
                  pages_read_user_content
                </code>{' '}
                → Generate token lại → paste token mới.
              </p>
            </Faq>

            <Faq question="App Review báo Application does not have permission (Dev mode)?">
              <p>
                Meta App của bạn ở chế độ <strong>Development</strong> và chưa
                add tài khoản FB của bạn vào danh sách tester.
              </p>
              <p className="mt-1">
                Fix: Meta App Dashboard → <strong>Roles → Roles</strong> → Add
                Administrators → thêm chính tài khoản bạn → confirm qua email →
                quay lại Graph Explorer thử lại.
              </p>
            </Faq>

            <Faq question="Tôi thấy data[] rỗng — không page nào hiện?">
              <p>Có 2 khả năng:</p>
              <ul className="list-disc list-inside ml-1 space-y-0.5">
                <li>
                  Tài khoản FB của bạn chưa được cấp quyền Admin/Editor trên
                  page → vào page → Settings → Page Access → thêm bạn làm
                  Admin.
                </li>
                <li>
                  Lúc OAuth popup hiện ra ở bước 3, bạn không tick page muốn
                  quản lý → bấm <strong>Generate Access Token</strong> lại, tick
                  đúng page lần này.
                </li>
              </ul>
            </Faq>

            <Faq question="Tôi paste token vào ô “Kiểm tra token” báo invalid?">
              <p>Thường do 3 lý do:</p>
              <ul className="list-disc list-inside ml-1 space-y-0.5">
                <li>Copy sót ký tự đầu/cuối — Page Token bắt đầu <code>EAA</code> và dài 150–250 ký tự</li>
                <li>Copy nhầm User Token (ô trên cùng) thay vì Page Token (trong data[])</li>
                <li>
                  Quên tick 2 permission ở bước 3 → sinh lại token với đủ
                  permission
                </li>
              </ul>
            </Faq>

            <Faq question="Page Token có an toàn không khi paste lên?">
              <p>
                Marketing OS mã hoá token bằng <code>pgcrypto</code>{' '}
                (AES-256-CBC) trước khi lưu vào Postgres. Token không xuất hiện
                trong log. Source code mã hoá:{' '}
                <code>app/src/lib/fb/token-encryption.ts</code>.
              </p>
            </Faq>
          </section>

          {/* Footer reference */}
          <div className="rounded-md bg-zinc-50 border border-zinc-200 px-3 py-2 text-xs text-zinc-600 flex items-center gap-2 flex-wrap">
            <span className="font-semibold">Tài liệu Meta chính thức:</span>
            <ExternalLink href="https://developers.facebook.com/docs/graph-api/reference/user/accounts/">
              GET /me/accounts
            </ExternalLink>
            <span className="text-zinc-300">·</span>
            <ExternalLink href="https://developers.facebook.com/docs/pages/access-tokens/">
              Page Access Tokens
            </ExternalLink>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Step({
  num,
  title,
  body,
}: {
  num: number;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <section className="flex gap-3 min-w-0">
      <div className="flex flex-col items-center pt-0.5 shrink-0">
        <div className="flex size-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold shrink-0">
          {num}
        </div>
        <div className="flex-1 w-px bg-zinc-200 mt-1" aria-hidden />
      </div>
      <div className="flex-1 pb-1 flex flex-col gap-2 min-w-0 break-words">
        <h3 className="font-semibold text-zinc-900 text-sm leading-snug break-words">
          {title}
        </h3>
        {body}
      </div>
    </section>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-blue-700 underline underline-offset-2 hover:text-blue-900"
    >
      {children}
      <ExternalLinkIcon className="size-3" />
    </a>
  );
}

function LinkBox({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-2.5 py-1.5 transition-colors w-fit"
    >
      Mở Graph API Explorer
      <ChevronRightIcon className="size-3.5" />
    </a>
  );
}

function PermissionPill({ children }: { children: React.ReactNode }) {
  return (
    <code className="inline-block rounded bg-white border border-zinc-300 px-1.5 py-0.5 text-[11px] font-mono">
      {children}
    </code>
  );
}

function CopyableCode({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function onCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-stretch gap-0 rounded-md border border-zinc-300 bg-zinc-50 overflow-hidden text-xs font-mono">
      <code className="flex-1 px-2.5 py-1.5 break-all">{value}</code>
      <button
        type="button"
        onClick={onCopy}
        className="px-2.5 border-l border-zinc-300 bg-white hover:bg-zinc-100 inline-flex items-center gap-1 text-zinc-600 text-[11px] font-sans"
        aria-label="Copy"
      >
        {copied ? (
          <>
            <CheckIcon className="size-3 text-emerald-600" />
            Copied
          </>
        ) : (
          <>
            <CopyIcon className="size-3" />
            Copy
          </>
        )}
      </button>
    </div>
  );
}

function FieldRow({
  label,
  desc,
  example,
  isLast,
}: {
  label: string;
  desc: string;
  example: string;
  isLast?: boolean;
}) {
  return (
    <>
      <div
        className={cn(
          'px-2.5 py-2 bg-zinc-50 font-mono text-zinc-900 font-semibold',
          !isLast && 'border-b border-zinc-200'
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          'px-2.5 py-2 flex flex-col',
          !isLast && 'border-b border-zinc-200'
        )}
      >
        <span className="text-zinc-700">{desc}</span>
        <span className="text-[10.5px] text-zinc-400 font-mono mt-0.5">
          VD: {example}
        </span>
      </div>
    </>
  );
}

function Faq({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="border border-zinc-200 rounded-md mb-1.5 group"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary
        className={cn(
          'cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2',
          'text-xs font-medium text-zinc-800 hover:bg-zinc-50',
          open && 'border-b border-zinc-200 bg-zinc-50'
        )}
      >
        <span>{question}</span>
        <ChevronRightIcon
          className={cn(
            'size-3.5 text-zinc-400 transition-transform shrink-0',
            open && 'rotate-90'
          )}
        />
      </summary>
      <div className="px-3 py-2 text-xs text-zinc-600 space-y-1">
        {children}
      </div>
    </details>
  );
}
