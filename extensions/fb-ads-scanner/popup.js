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
const elClip = $('clip');
const elSave = $('save');
const elStatus = $('status');

// Hàm chạy TRONG trang đang mở (qua chrome.scripting) để trích nội dung.
// Phải tự chứa — không tham chiếu biến ngoài.
function extractPageContent() {
  function meta(sel) {
    const el = document.querySelector(sel);
    return el && el.content ? el.content.trim() : '';
  }
  const title =
    meta('meta[property="og:title"]') ||
    meta('meta[name="twitter:title"]') ||
    document.title ||
    '';
  const image =
    meta('meta[property="og:image"]') ||
    meta('meta[name="twitter:image"]') ||
    (document.querySelector('article img, main img, img') || {}).src ||
    '';
  let text = meta('meta[property="og:description"]') || meta('meta[name="description"]') || '';
  if (!text) {
    const p = document.querySelector('article p, main p, p');
    text = p ? p.innerText || '' : '';
  }
  return {
    url: location.href,
    title: String(title).slice(0, 300),
    image: image || '',
    text: String(text).slice(0, 600),
  };
}

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

// ─── Clip trang web bất kỳ ──────────────────────────────────────────────
elClip.addEventListener('click', async () => {
  const { siteUrl, token } = await saveConfig();
  if (!siteUrl || !token) {
    setStatus('Nhập Website URL và token trước.', 'err');
    return;
  }
  const tab = await getActiveTab();
  if (!tab || !/^https?:\/\//.test(tab.url || '')) {
    setStatus('Mở một trang web (http/https) rồi bấm Clip.', 'err');
    return;
  }

  elClip.disabled = true;
  setStatus('Đang đọc nội dung trang…');

  let clip;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent,
    });
    clip = results && results[0] && results[0].result;
  } catch (e) {
    setStatus('Không đọc được trang này (trang đặc biệt / bị chặn).\n(' + e.message + ')', 'err');
    elClip.disabled = false;
    return;
  }

  if (!clip || !clip.url) {
    setStatus('Không lấy được nội dung trang.', 'err');
    elClip.disabled = false;
    return;
  }

  setStatus('Đang lưu vào Tin tức…');
  try {
    const res = await fetch(siteUrl + '/api/news/ingest-web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ items: [clip] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus('Lỗi server (' + res.status + '): ' + (data.error || ''), 'err');
      return;
    }
    if ((data.inserted ?? 0) > 0) {
      setStatus('✓ Đã lưu "' + String(clip.title || clip.url).slice(0, 60) + '" vào Tin tức.', 'ok');
    } else {
      setStatus('Trang này đã có trong Tin tức (không thêm trùng).', 'ok');
    }
  } catch (e) {
    setStatus('Không gọi được website. Kiểm tra URL/mạng.\n(' + e.message + ')', 'err');
  } finally {
    elClip.disabled = false;
  }
});
