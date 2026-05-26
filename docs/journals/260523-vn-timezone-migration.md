# VN Timezone Migration — Phases 01-03 Shipped

**Date**: 2026-05-23 10:05
**Severity**: High
**Component**: `account_metric_daily` ingestion + dashboard trend
**Status**: Partially Resolved (Phase 04 deferred to user — destructive prod op)

## What Shipped

Commit `6180fee` on `main`. Three phases of the VN timezone plan went out:

- **Phase 01** — Renamed `pt-date.ts` -> `tz-dates.ts`. Added `vnDateKeyFromEndTime`, `toVnDateKey`, `vnDateKeyNow`. Kept PT helpers alongside (debug + dual-TZ visibility for future readers). `parse-insights.ts` + 4 callers updated.
- **Phase 02** — Fetch window `unixDaysAgo(2)` -> `unixDaysAgo(7)`. Self-heals from FB backdated updates.
- **Phase 03** — `parseInsights` now skips points whose `end_time` is in the future. FB returns boundary rows with `value=0` for not-yet-started PT days; those were the original culprit.

Verification: `app/scripts/verify-tz-dates.ts` (tsx + `node:assert`, 11/11). `npx tsc --noEmit` clean.

## What Caught Us Out

Reviewer flagged two files the plan never mentioned: `channel-detail.ts:173` and `dashboard-trend.ts:49,56` were bucketing `social_post.published_at` in **PT** while JOIN-ing against `amd.date` which is now **VN**. Posts published 00:00-14:59 VN would land in the wrong bucket; `FULL OUTER JOIN` would double-row the chart. Switched both to `Asia/Ho_Chi_Minh`.

Also fixed outside the plan: `run-sync.ts:96` synthetic-today fallback row was still using `toPtDateKey(new Date())` — would have produced a row with a different `dateKey` than what `parseInsights` now emits, breaking the UPSERT alignment. Now `vnDateKeyNow()`.

The plan was a 4-phase rename; reality was a 4-phase rename + 3 stealth join sites. Code review earned its keep today.

## Root Cause (one-liner, for the file)

`amd.date` was the PT calendar day; UI compared it to VN `CURRENT_DATE`. PT-today's still-zero row was labelled VN-yesterday and dashboard filter dropped it.

## Deferred

- **Phase 04** — Backup -> `TRUNCATE account_metric_daily` -> deploy -> manual cron trigger on Coolify. User owns it; not running TRUNCATE from an agent session on shared prod state.
- **HIGH follow-up** — `run-sync.ts` synthetic row races cron and clobbers `follower_growth` via unconditional `EXCLUDED.follower_growth` in `upsert-helpers.ts:74`. Pre-existing, but more reachable post-migration. New task.
- **MEDIUM follow-up** — Transition window has both PT-dated and VN-dated rows as distinct PKs. Phase 04 TRUNCATE wipes them.

## Decisions Worth Remembering

1. Kept PT helpers in `tz-dates.ts` instead of deleting. Explicit naming makes the dual-TZ reality visible; useful for debug diffs.
2. tsx + `node:assert` verify script over installing jest/vitest. YAGNI — project has no test framework, a 30-line helper doesn't justify adding one.
3. Did NOT bundle the `follower_growth` race fix into this commit. Scope discipline; bug pre-existed; separate change, separate review.

## Lesson

Renaming a date semantic is never just a rename. Every JOIN that touches that column lives in a different timezone assumption until proven otherwise. Next time: grep for every `JOIN ... ON .*date` before declaring the plan complete, not after the reviewer does it.
