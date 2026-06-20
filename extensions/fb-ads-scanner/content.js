// Chạy ở world ISOLATED — cầu nối giữa interceptor (MAIN) và popup.
// Gom ad node vào buffer (dedupe theo id), trả về khi popup bấm "Scan".
//
// Buffer tích luỹ theo thời gian: user cuộn trang Ads Library → FB load thêm
// ad → interceptor bắt → buffer lớn dần. Bấm Scan đẩy toàn bộ buffer.

(function () {
  const buffer = new Map(); // id -> ad node

  function idOf(ad) {
    return String(
      ad.ad_archive_id ||
        ad.adArchiveID ||
        ad.adArchiveId ||
        ad.adId ||
        ad.id ||
        JSON.stringify(ad).slice(0, 80)
    );
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || !d.__fbadsScan || !Array.isArray(d.ads)) return;
    for (const ad of d.ads) {
      if (ad && typeof ad === 'object') buffer.set(idOf(ad), ad);
    }
  });

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg) return;
    if (msg.cmd === 'COLLECT') {
      sendResponse({ ads: Array.from(buffer.values()), count: buffer.size });
    } else if (msg.cmd === 'CLEAR') {
      buffer.clear();
      sendResponse({ ok: true });
    } else if (msg.cmd === 'PING') {
      sendResponse({ ok: true, count: buffer.size });
    }
    return true; // async-safe
  });
})();
