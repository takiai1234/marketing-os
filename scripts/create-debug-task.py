"""Tạo Coolify scheduled task chạy psql query, đọc execution output.

Quy trình:
1. POST tạo task `* * * * *` (mỗi phút) trong container postgres
2. Đợi 70-130 giây cho cron fire
3. GET executions → message field chứa stdout
4. DELETE task

Workaround: Coolify API không có endpoint exec/terminal. DB không expose
external port. Scheduled task là cách duy nhất chạy lệnh qua REST API.
"""
import json
import sys
import time
import urllib.request
import urllib.error

API = "http://152.53.177.175:19123/api/v1"
TOKEN = "3|Zmd8ASSNeyk7PuGS6dZPykryBtAykpjaxQ1msDC91798a4d2"
APP_UUID = "pj88qdc1wpp8gjwfbr1hw1os"
PG_CONTAINER = "u13nbir4b0le8gl4dpjeuc1g"  # hostname/container postgres
PG_PASSWORD = "Dn6CUMzMTbBLlz1nj8bw2XhcghsMPwfT"

# Heredoc qua sh -c: tránh quote-escape hell trong JSON
# psql đọc SQL từ stdin → không cần escape SQL nội bộ
SQL = """\\echo === Q1 SYNC LOGS page_insights 21-23/5 ===
SELECT to_char(started_at AT TIME ZONE 'Asia/Ho_Chi_Minh','MM-DD HH24:MI') t,
       LEFT(account_id::text,8) acc, status,
       records_upserted rows, COALESCE(LEFT(error_message,60),'-') err
FROM api_sync_log
WHERE sync_type='page_insights'
  AND started_at >= '2026-05-21'::timestamptz
  AND started_at <  '2026-05-24'::timestamptz
ORDER BY started_at DESC LIMIT 60;

\\echo === Q2 DAILY AGGREGATE 20-23/5 ===
SELECT date, COUNT(*) accs,
       SUM(total_reach) sum_reach, SUM(total_reach_unique) sum_reach_u,
       COUNT(*) FILTER (WHERE total_reach=0) zero_r,
       SUM(followers) fol, SUM(total_engagement) eng
FROM account_metric_daily
WHERE date BETWEEN '2026-05-20' AND '2026-05-23'
GROUP BY date ORDER BY date;

\\echo === Q3 PER-ACCOUNT 22/5 ===
SELECT LEFT(a.name,38) name,
       m.total_reach reach, m.total_reach_unique reach_u,
       m.followers fol, m.total_engagement eng, m.page_views pv
FROM account_metric_daily m
JOIN social_account a ON a.id=m.account_id
WHERE m.date='2026-05-22'
ORDER BY a.name;
"""

# Wrap heredoc: SQL_TERMINATOR là sentinel không xuất hiện trong SQL
COMMAND = (
    f"sh -c 'PGPASSWORD=\"{PG_PASSWORD}\" "
    "psql -h localhost -U marketing -d marketing_os -A -F \"|\" "
    "<< SQLDONE\n"
    + SQL
    + "SQLDONE\n'"
)

body = {
    "name": "debug-reach-may22",
    "command": COMMAND,
    "frequency": "* * * * *",
    "container": PG_CONTAINER,
    "timeout": 60,
    "enabled": True,
}

print("Creating task...")
req = urllib.request.Request(
    f"{API}/applications/{APP_UUID}/scheduled-tasks",
    data=json.dumps(body).encode("utf-8"),
    method="POST",
    headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    },
)
try:
    resp = urllib.request.urlopen(req, timeout=30)
    data = json.loads(resp.read())
    task_uuid = data.get("uuid")
    print(f"Created task uuid={task_uuid}")
except urllib.error.HTTPError as e:
    body_bytes = e.read()
    sys.stdout.buffer.write(b"HTTP " + str(e.code).encode() + b"\n")
    sys.stdout.buffer.write(body_bytes[:2000])
    sys.stdout.buffer.write(b"\n")
    sys.exit(1)
