// Demo: convert FB end_time → PT date (code cũ) vs VN date (code mới).
// Dùng raw FB response thật đã capture ở .fb-raw-22may.json.
// Chạy: node scripts/demo-tz-conversion.mjs

import fs from 'fs';

// === Helpers ===
const PT_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

const VN_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

function ptDateFromEndTime(endTime) {
  return PT_FORMATTER.format(new Date(new Date(endTime).getTime() - 1));
}

function vnDateFromEndTime(endTime) {
  return VN_FORMATTER.format(new Date(new Date(endTime).getTime() - 1));
}

// === Load raw FB data ===
const raw = JSON.parse(fs.readFileSync('.fb-raw-22may.json', 'utf-8'));
const responseSample = raw[0].d.responseSample;
const metrics = responseSample.data;

console.log('=== DEMO: FB Page Insights raw → DB date conversion ===\n');
console.log('Source: 1 account, cron run 22/5 09:00 VN (= 22/5 02:00 UTC)\n');

const NOW_MS = new Date('2026-05-22T02:00:00Z').getTime();  // giả lập cron run lúc đó

// Focus metric chính: page_media_view (= cột total_reach)
const reach = metrics.find((m) => m.name === 'page_media_view');
console.log('--- Metric: page_media_view (= cột total_reach trong DB) ---\n');

console.log(
  'end_time UTC'.padEnd(28) +
  '| PT date (old)'.padEnd(16) +
  '| VN date (new)'.padEnd(16) +
  '| value'.padEnd(10) +
  '| Phase 03 skip?'
);
console.log('-'.repeat(95));

for (const point of reach.values) {
  const ptDate = ptDateFromEndTime(point.end_time);
  const vnDate = vnDateFromEndTime(point.end_time);
  const isFuture = new Date(point.end_time).getTime() > NOW_MS;
  const skip = isFuture ? 'YES (skip)' : 'no';
  console.log(
    String(point.end_time).padEnd(28) +
    `| ${ptDate}`.padEnd(16) +
    `| ${vnDate}`.padEnd(16) +
    `| ${String(point.value)}`.padEnd(10) +
    `| ${skip}`
  );
}

console.log('\n--- Diễn giải ---');
console.log('Row cuối (end_time=2026-05-23T07:00Z, value=0):');
console.log('  Code OLD: ghi vào DB date=2026-05-22 (PT) → user nhìn dashboard tưởng "22/5 = 0" ← BUG');
console.log('  Code NEW: map ra DB date=2026-05-23 (VN) → là "today VN" → UI filter `< CURRENT_DATE` hide ✓');
console.log('  + Phase 03: end_time > now() → skip hoàn toàn, không ghi vào DB ✓');

console.log('\n--- All 8 metrics: cùng pattern ---');
console.log(
  '\nmetric'.padEnd(38) +
  '| end_time UTC'.padEnd(28) +
  '| VN date'.padEnd(14) +
  '| value'
);
console.log('-'.repeat(95));
for (const m of metrics) {
  for (const point of m.values) {
    const v = typeof point.value === 'object' ? JSON.stringify(point.value).slice(0, 40) : point.value;
    console.log(
      m.name.padEnd(38) +
      `| ${point.end_time}`.padEnd(28) +
      `| ${vnDateFromEndTime(point.end_time)}`.padEnd(14) +
      `| ${v}`
    );
  }
}

console.log('\n--- Edge case demo: VN-midnight transitions ---');
const edgeCases = [
  '2026-05-22T16:59:59+0000',  // VN 23:59:59
  '2026-05-22T17:00:00+0000',  // VN 24:00:00 = VN 23/5 00:00:00
  '2026-05-23T07:00:00+0000',  // VN 14:00:00 (mid-day)
];
console.log(
  'UTC moment'.padEnd(28) +
  '| VN local'.padEnd(28) +
  '| VN date'
);
console.log('-'.repeat(75));
for (const ts of edgeCases) {
  const vnLocal = new Date(ts).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(
    ts.padEnd(28) +
    `| ${vnLocal}`.padEnd(28) +
    `| ${vnDateFromEndTime(ts)}`
  );
}
