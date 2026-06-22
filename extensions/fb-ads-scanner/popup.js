// Popup: cấu hình (Website URL + token) + nút Scan.
// Popup chạy trong ngữ cảnh extension nên fetch chéo-origin được nhờ
// host_permissions — không cần background service worker.
//
// Scan: lấy tab đang mở → gửi COLLECT cho content script (gom buffer ad) →
// POST về /api/news/ingest-ads kèm Bearer token → hiện kết quả → xoá buffer.

const $ = (id) => document.getElementById(id);
const elSite = $('siteUrl');
const elToken = $('token');
const elScan = $('scan');
const elSave = $('save');
const elStatus = $('status');

function setStatus(msg, kind) {
  elStatus.textContent = msg;
  elStatus.className = kind || '';
}

// ─── Load / save config ────────────────────────────────────────────────
chrome.storage.local.get(['siteUrl', 'token'], (cfg) => {
  if (cfg.siteUrl) elSite.value = cfg.siteUrl;
  if (cfg.token) elToken.value = cfg.token;
});

function saveConfig() {
  const siteUrl = elSite.value.trim().replace(/\/+$/, '');
  const token = elToken.value.trim();
  return new Promise((resolve) => {
    chrome.storage.local.set({ siteUrl, token }, () => resolve({ siteUrl, token }));
  });
}

elSave.addEventListener('click', async () => {
  await saveConfig();
  setStatus('Đã lưu cấu hình.', 'ok');
});

// ─── Helpers ───────────────────────────────────────────────────────────
function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

function sendToTab(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(resp);
    });
  });
}

// ─── Scan ──────────────────────────────────────────────────────────────
elScan.addEventListener('click', async () => {
  const { siteUrl, token } = await saveConfig();
  if (!siteUrl || !token) {
    setStatus('Nhập Website URL và token trước.', 'err');
    return;
  }

  const tab = await getActiveTab();
  if (!tab || !/^https?:\/\/([a-z-]+\.)?facebook\.com\/ads\/library/.test(tab.url || '')) {
    setStatus(
      'Hãy mở tab Facebook Ads Library (facebook.com/ads/library) rồi Scan.',
      'err'
    );
    return;
  }

  elScan.disabled = true;
  setStatus('Đang gom ad từ trang…');

  let collected;
  try {
    collected = await sendToTab(tab.id, { cmd: 'COLLECT' });
  } catch (e) {
    setStatus(
      'Không kết nối được content script. Tải lại trang Ads Library rồi thử lại.\n(' +
        e.message +
        ')',
      'err'
    );
    elScan.disabled = false;
    return;
  }

  const ads = (collected && collected.ads) || [];
  if (ads.length === 0) {
    setStatus(
      'Chưa bắt được ad nào. Cuộn trang Ads Library để FB nạp ad, rồi Scan lại.',
      'err'
    );
    elScan.disabled = false;
    return;
  }

  setStatus(`Đang đẩy ${ads.length} ad về website…`);
  try {
    const res = await fetch(siteUrl + '/api/news/ingest-ads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ items: ads }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus('Lỗi từ server (' + res.status + '): ' + (data.error || ''), 'err');
      elScan.disabled = false;
      return;
    }
    setStatus(
      `✓ Xong. Gửi ${data.received ?? ads.length} ad — map ${data.mapped ?? '?'} — thêm mới ${data.inserted ?? '?'}.`,
      'ok'
    );
    // Xoá buffer để lần Scan sau không gửi trùng (server vẫn dedupe theo link).
    try {
      await sendToTab(tab.id, { cmd: 'CLEAR' });
    } catch (_) {}
  } catch (e) {
    setStatus('Không gọi được website. Kiểm tra URL/mạng.\n(' + e.message + ')', 'err');
  } finally {
    elScan.disabled = false;
  }
});
