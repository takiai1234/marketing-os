// Chạy ở world ISOLATED — cầu nối giữa interceptor (MAIN) và popup.
// Gom ad node vào buffer (dedupe theo id), trả về khi popup bấm "Scan".
//
// Buffer tích luỹ theo thời gian: user cuộn trang Ads Library → FB load thêm
// ad → interceptor bắt → buffer lớn dần. Bấm Scan đẩy toàn bộ buffer.

(function () {
  const buffer = new Map(); // id -> ad node (đã rút gọn)

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

  // Ad node thô của FB rất nặng (vài trăm KB/ad, nhiều field thừa) → gửi cả
  // sang server làm body phình to → Nginx/app ngắt giữa chừng → lỗi 502.
  // Rút gọn còn ĐÚNG các field mà server mapFacebookAdItem cần đọc. Giữ cấu
  // trúc snapshot tối thiểu để mapper hoạt động y nguyên.
  function slimAd(ad) {
    const s = (ad && ad.snapshot) || {};
    const imgs = Array.isArray(s.images) ? s.images : [];
    const vids = Array.isArray(s.videos) ? s.videos : [];
    const cards = Array.isArray(s.cards) ? s.cards : [];
    const img0 = imgs[0] || {};
    const vid0 = vids[0] || {};
    const card0 = cards[0] || {};
    return {
      ad_archive_id:
        ad.ad_archive_id || ad.adArchiveID || ad.adArchiveId || ad.adId || ad.id,
      page_name: ad.page_name || ad.pageName,
      start_date: ad.start_date || ad.startDate,
      ad_delivery_start_time: ad.ad_delivery_start_time,
      url: ad.url || ad.adLibraryUrl || ad.snapshotUrl,
      snapshot: {
        body: { text: s.body && s.body.text },
        title: s.title,
        page_profile_picture_url:
          s.page_profile_picture_url || s.pageProfilePictureURL,
        images: [
          {
            original_image_url:
              img0.original_image_url || img0.originalImageURL,
            resized_image_url: img0.resized_image_url || img0.resizedImageUrl,
          },
        ],
        videos: [
          {
            video_preview_image_url:
              vid0.video_preview_image_url || vid0.videoPreviewImageURL,
          },
        ],
        cards: [
          {
            body: card0.body,
            original_image_url:
              card0.original_image_url || card0.originalImageURL,
          },
        ],
      },
    };
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || !d.__fbadsScan || !Array.isArray(d.ads)) return;
    for (const ad of d.ads) {
      if (ad && typeof ad === 'object') {
        const id = idOf(ad);
        if (id) buffer.set(id, slimAd(ad));
      }
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
