// Chạy ở world MAIN (cùng ngữ cảnh trang FB) để hook window.fetch / XHR.
// Mục tiêu: bắt response GraphQL của Facebook Ads Library — chứa JSON ad có
// CẤU TRÚC (ad_archive_id, page_name, snapshot…), sạch hơn nhiều so với scrape
// DOM. Mỗi khi thấy ad node, postMessage sang content script (world ISOLATED)
// để gom buffer.
//
// Không sửa/đụng dữ liệu trang — chỉ clone response để đọc.

(function () {
  const TAG = '[FBADS]';

  // Gom đệ quy mọi object trông giống "ad node" (có ad_archive_id ở bất kỳ độ
  // sâu nào) → bền với thay đổi shape GraphQL của FB.
  function deepCollect(obj, out, seen) {
    if (!obj || typeof obj !== 'object') return;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (const v of obj) deepCollect(v, out, seen);
      return;
    }
    if ('ad_archive_id' in obj || 'adArchiveID' in obj || 'adArchiveId' in obj) {
      out.push(obj);
    }
    for (const k in obj) {
      try {
        deepCollect(obj[k], out, seen);
      } catch (_) {
        /* getter throw — bỏ qua */
      }
    }
  }

  // FB có thể trả nhiều JSON nối nhau (incremental @stream/@defer) hoặc tiền tố
  // chống hijack. Thử parse nguyên khối → fallback parse từng dòng.
  function parseMaybeMulti(text) {
    const results = [];
    const cleaned = text.replace(/^\s*for\s*\(;;\);/, '').trim();
    try {
      results.push(JSON.parse(cleaned));
      return results;
    } catch (_) {
      /* multi-part bên dưới */
    }
    for (const line of cleaned.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        results.push(JSON.parse(t));
      } catch (_) {
        /* bỏ chunk hỏng */
      }
    }
    return results;
  }

  function handleText(text) {
    if (
      !text ||
      (text.indexOf('ad_archive_id') === -1 && text.indexOf('adArchiveID') === -1)
    ) {
      return;
    }
    const ads = [];
    const seen = new Set();
    for (const obj of parseMaybeMulti(text)) deepCollect(obj, ads, seen);
    if (ads.length) {
      window.postMessage({ __fbadsScan: true, ads }, '*');
    }
  }

  // ─── Hook fetch ─────────────────────────────────────────────────────────
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input && input.url;
        if (typeof url === 'string' && url.indexOf('/api/graphql') !== -1) {
          p.then((res) => {
            try {
              res.clone().text().then(handleText).catch(function () {});
            } catch (_) {}
          }).catch(function () {});
        }
      } catch (_) {}
      return p;
    };
  }

  // ─── Hook XHR (FB dùng ít hơn nhưng vẫn có) ──────────────────────────────
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__fbadsUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      try {
        if (
          typeof this.__fbadsUrl === 'string' &&
          this.__fbadsUrl.indexOf('/api/graphql') !== -1
        ) {
          this.addEventListener('load', function () {
            try {
              if (this.responseType === '' || this.responseType === 'text') {
                handleText(this.responseText);
              }
            } catch (_) {}
          });
        }
      } catch (_) {}
      return origSend.apply(this, arguments);
    };
  } catch (_) {}

  console.log(TAG, 'interceptor installed');
})();
