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
const elScanPage = $('scanpage');
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

// Chạy TRONG trang: dò mọi "bài viết" trên trang danh sách (blog, chuyên mục).
// Heuristic: lấy các <a> có tiêu đề đủ dài, kèm ảnh gần đó; bỏ link nav/footer
// ngắn; dedupe theo URL; tối đa 150 bài. Tự chứa, không tham chiếu ngoài.
function extractArticles() {
  const out = [];
  const seen = new Set();

  function abs(href) {
    try {
      return new URL(href, location.href).toString();
    } catch (_) {
      return null;
    }
  }
  // Bỏ phần tử nằm trong menu/header/footer/sidebar → tránh vớ link điều hướng.
  function inChrome(el) {
    return !!el.closest(
      'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], [role="search"]'
    );
  }
  // Ảnh trong phạm vi 1 link: <img> (kèm lazy) hoặc <source srcset> của <picture>.
  function pickImage(scope) {
    const im = scope.querySelector('img');
    if (im) {
      const s =
        im.currentSrc ||
        im.src ||
        im.getAttribute('data-src') ||
        im.getAttribute('data-lazy-src');
      if (s) return s;
    }
    const src = scope.querySelector('source[srcset], img[srcset]');
    if (src) {
      const first = (src.getAttribute('srcset') || '').split(',')[0];
      if (first) return first.trim().split(/\s+/)[0];
    }
    return '';
  }

  // Duyệt theo TỪNG LINK-BÀI: mỗi <a href> chứa heading và/hoặc ảnh = 1 bài.
  // (Beehiiv/Ghost/Medium… đặt tiêu đề <hN> + ảnh BÊN TRONG link, không dùng
  //  <article>.) Dedupe theo URL → 1 bài link nhiều lần vẫn 1 mục.
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href || href[0] === '#' || /^(javascript|mailto|tel):/i.test(href)) continue;
    const url = abs(href);
    if (!url || !/^https?:/i.test(url)) continue;
    if (seen.has(url)) continue;
    if (inChrome(a)) continue;

    // Tiêu đề: heading trong link (textContent = chỉ tiêu đề, sạch) > aria-label
    // > text link. Dùng textContent thay innerText để ổn định mọi môi trường.
    const h = a.querySelector('h1, h2, h3, h4, h5, h6');
    let title = h ? h.textContent || '' : '';
    if (!title) title = a.getAttribute('aria-label') || '';
    if (!title) title = a.textContent || '';
    title = String(title).replace(/\s+/g, ' ').trim();
    if (title.length < 12 || title.length > 300) continue;

    // Ảnh trong link, hoặc trong khối cha gần nhất.
    let img = pickImage(a);
    if (!img) {
      const box = a.closest('li, article, div, section');
      if (box) img = pickImage(box);
    }

    // Lọc rác: link-bài thật thường có ẢNH hoặc HEADING. Link nav thuần text
    // (không ảnh, không heading) bị loại.
    if (!img && !h) continue;

    seen.add(url);
    out.push({ url, title, image: img || '', text: '' });
    if (out.length >= 150) break;
  }
  return out;
}

// Chạy TRONG trang Facebook: dò theo TỪNG BÀI ĐĂNG (mỗi khối role="article" = 1
// bài). Quan trọng: 1 bài nhiều ảnh vẫn tính LÀ 1 BÀI (lấy ảnh đầu làm bìa),
// KHÔNG tách mỗi ảnh thành 1 mục. Dedupe theo permalink đã làm sạch tracking.
function extractFacebookPosts() {
  function cleanUrl(href) {
    try {
      const u = new URL(href, location.href);
      const keep = new URLSearchParams();
      ['story_fbid', 'id', 'v', 'fbid'].forEach((k) => {
        const val = u.searchParams.get(k);
        if (val) keep.set(k, val);
      });
      u.search = keep.toString(); // bỏ __cft__/__tn__... để dedupe ổn định
      u.hash = '';
      return u.toString();
    } catch (_) {
      return href;
    }
  }

  const out = [];
  const seen = new Set();
  const articles = document.querySelectorAll('div[role="article"]');
  for (const art of articles) {
    // Permalink của bài: link bài/ảnh/video/reel
    let url = '';
    const links = art.querySelectorAll('a[href]');
    for (const a of links) {
      const href = a.href || '';
      if (
        /\/posts\/|\/permalink\/|\/videos\/|\/reel\/|\/photo/.test(href) ||
        /story_fbid=|[?&]fbid=/.test(href)
      ) {
        url = cleanUrl(href);
        break;
      }
    }
    if (!url || seen.has(url)) continue;

    // Nội dung bài
    let text = '';
    const msgEl =
      art.querySelector('[data-ad-preview="message"]') ||
      art.querySelector('[data-ad-comet-preview="message"]') ||
      art.querySelector('div[dir="auto"]');
    if (msgEl) text = msgEl.innerText || '';
    text = String(text).replace(/\s+/g, ' ').trim();

    // Ảnh ĐẦU TIÊN làm bìa (bài nhiều ảnh → vẫn 1 bài)
    let img = '';
    const im = art.querySelector('img[src*="scontent"]') || art.querySelector('img');
    if (im) img = im.currentSrc || im.getAttribute('src') || '';

    seen.add(url);
    out.push({
      url,
      title: (text || 'Bài viết Facebook').slice(0, 200),
      image: img || '',
      text: text.slice(0, 600),
    });
    if (out.length >= 100) break;
  }
  return out;
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

// ─── Quét tất cả bài trên trang danh sách ───────────────────────────────
elScanPage.addEventListener('click', async () => {
  const { siteUrl, token } = await saveConfig();
  if (!siteUrl || !token) {
    setStatus('Nhập Website URL và token trước.', 'err');
    return;
  }
  const tab = await getActiveTab();
  if (!tab || !/^https?:\/\//.test(tab.url || '')) {
    setStatus('Mở một trang web (http/https) rồi bấm Quét.', 'err');
    return;
  }

  elScanPage.disabled = true;

  // Facebook → dò theo từng BÀI ĐĂNG (1 bài = 1 mục, nhiều ảnh vẫn 1 bài).
  // Trang web thường → dò mọi link bài viết.
  const isFb = /^https?:\/\/([a-z-]+\.)?facebook\.com\//.test(tab.url || '');
  const extractor = isFb ? extractFacebookPosts : extractArticles;
  setStatus(isFb ? 'Đang dò bài đăng Facebook…' : 'Đang dò bài viết trên trang…');

  let articles;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractor,
    });
    articles = (results && results[0] && results[0].result) || [];
  } catch (e) {
    setStatus('Không đọc được trang này (trang đặc biệt / bị chặn).\n(' + e.message + ')', 'err');
    elScanPage.disabled = false;
    return;
  }

  if (!articles.length) {
    setStatus(
      isFb
        ? 'Chưa thấy bài đăng nào. Cuộn trang Facebook để nạp bài rồi Quét lại.'
        : 'Không tìm thấy bài viết nào trên trang. Thử trang danh sách (trang chủ blog, chuyên mục).',
      'err'
    );
    elScanPage.disabled = false;
    return;
  }

  setStatus('Tìm thấy ' + articles.length + ' bài — đang lưu…');
  try {
    const res = await fetch(siteUrl + '/api/news/ingest-web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ items: articles }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus('Lỗi server (' + res.status + '): ' + (data.error || ''), 'err');
      return;
    }
    const inserted = data.inserted ?? 0;
    if (inserted > 0) {
      setStatus('✓ Đã lưu ' + inserted + ' bài mới (dò ' + articles.length + ' link).', 'ok');
    } else {
      setStatus('Dò ' + articles.length + ' link — tất cả đã có trong Tin tức.', 'ok');
    }
  } catch (e) {
    setStatus('Không gọi được website. Kiểm tra URL/mạng.\n(' + e.message + ')', 'err');
  } finally {
    elScanPage.disabled = false;
  }
});
