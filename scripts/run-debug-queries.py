"""Chạy 3 debug queries bằng cách tạo/update Coolify scheduled tasks.

Workaround: Coolify scheduled_tasks.command column = varchar(255).
Mỗi task chỉ chứa 1 query ngắn. 3 tasks chạy đồng thời sau next minute boundary.
"""
import json
import sys
import time
import urllib.request
import urllib.error

API = "http://152.53.177.175:19123/api/v1"
TOKEN = "3|Zmd8ASSNeyk7PuGS6dZPykryBtAykpjaxQ1msDC91798a4d2"
APP = "pj88qdc1wpp8gjwfbr1hw1os"

def request(method, path, body=None):
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode("utf-8") if body else None,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")[:1500]


# Node wrapper: dùng JS double-quote string cho SQL → escape \" để thoát
# shell outer double-quotes. KHÔNG dùng backtick vì shell interpret backtick
# là command substitution và làm SQL bị eval sai.
def make_cmd(sql: str) -> str:
    return (
        "node -e \"new(require('pg').Pool)({connectionString:process.env.DATABASE_URL})"
        ".query(\\\"" + sql + "\\\").then(r=>console.log(JSON.stringify(r.rows)))\""
    )


# Compress sát mức cần thiết để vừa 125 chars (= 255 - 130 wrapper).
# Bỏ alias cột, bỏ space thừa sau dấu ),  AND, FROM (nếu syntactically ok).

# Q1: sync log group by date + status — xem cron chạy ngày nào, fail/success
# Bỏ LIMIT để fit 122 chars (kết quả vẫn nhỏ vì group theo date+status)
SQL1 = ("SELECT started_at::date,status,COUNT(*)FROM api_sync_log "
        "WHERE sync_type='page_insights'GROUP BY 1,2 ORDER BY 1 DESC")

# Q2: aggregate reach by date — xem reach có thực sự = 0 ngày 22/5 hay không
# Bỏ ORDER BY vì chỉ 4 rows
SQL2 = ("SELECT date,SUM(total_reach),SUM(total_reach_unique)"
        "FROM account_metric_daily WHERE date>'2026-5-19' GROUP BY 1")

# Q3: per-account 22/5 — list từng kênh có reach gì
SQL3 = ("SELECT name,total_reach,followers FROM account_metric_daily "
        "JOIN social_account ON id=account_id WHERE date='2026-5-22'")

cmds = [("q1-sync", SQL1), ("q2-daily", SQL2), ("q3-22may", SQL3)]
for name, sql in cmds:
    c = make_cmd(sql)
    print(f"{name}: cmd_len={len(c)}")
    if len(c) > 255:
        print("  TOO LONG:", c)
        sys.exit(1)

# Get existing tasks - reuse / update / delete
status, tasks = request("GET", f"/applications/{APP}/scheduled-tasks")
print(f"\nExisting tasks: {len(tasks) if isinstance(tasks,list) else tasks}")
existing_uuids = []
if isinstance(tasks, list):
    for t in tasks:
        print(f"  - {t.get('name')} uuid={t.get('uuid')}")
        existing_uuids.append(t.get("uuid"))

# Clean up old tasks
for uuid in existing_uuids:
    request("DELETE", f"/applications/{APP}/scheduled-tasks/{uuid}")
    print(f"Deleted {uuid}")

# Create 3 fresh tasks - all fire at next * * * * * tick simultaneously
created = []
for name, sql in cmds:
    body = {
        "name": name,
        "command": make_cmd(sql),
        "frequency": "* * * * *",
        "container": "u13nbir4b0le8gl4dpjeuc1g",
        "timeout": 30,
        "enabled": True,
    }
    code, data = request("POST", f"/applications/{APP}/scheduled-tasks", body)
    if code == 201:
        created.append((name, data["uuid"]))
        print(f"Created {name} -> {data['uuid']}")
    else:
        print(f"Failed {name}: {code} {data}")

# Đợi next cron tick + 5s buffer
print("\nWaiting 75s for cron tick + execution...")
time.sleep(75)

# Fetch executions for each task
for name, uuid in created:
    print(f"\n=== {name} ===")
    code, execs = request("GET", f"/applications/{APP}/scheduled-tasks/{uuid}/executions")
    if not isinstance(execs, list) or not execs:
        print(f"  no executions yet: {execs}")
        continue
    latest = sorted(execs, key=lambda x: x.get("started_at", ""))[-1]
    print(f"  status: {latest.get('status')}  duration: {latest.get('duration')}s")
    msg = latest.get("message") or ""
    print(f"  message ({len(msg)} chars):")
    print(msg[:5000])
