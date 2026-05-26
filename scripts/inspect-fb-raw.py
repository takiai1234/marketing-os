"""Inspect raw FB response stored in api_sync_log.details cho 1 page_insights run ngày 22/5.

So sánh raw values FB trả về với value đã lưu trong account_metric_daily
để xác định bug nằm ở parse hay upsert.
"""
import json
import sys
import time
import urllib.request

API = "http://152.53.177.175:19123/api/v1"
TOKEN = "3|Zmd8ASSNeyk7PuGS6dZPykryBtAykpjaxQ1msDC91798a4d2"
APP = "pj88qdc1wpp8gjwfbr1hw1os"

H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def make_cmd(sql: str) -> str:
    return (
        "node -e \"new(require('pg').Pool)({connectionString:process.env.DATABASE_URL})"
        ".query(\\\"" + sql + "\\\").then(r=>console.log(JSON.stringify(r.rows)))\""
    )


# Q1: get first call's full details (url, params, responseSample) ngày 22/5
# 120 char budget
SQL = ("SELECT details->0 d FROM api_sync_log "
       "WHERE sync_type='page_insights' "
       "AND started_at::date='2026-5-22' LIMIT 1")

print("SQL:", SQL, f"len={len(SQL)}")
cmd = make_cmd(SQL)
print("cmd len:", len(cmd))
assert len(cmd) <= 255, f"too long {len(cmd)}"

# Create task
body = {
    "name": "inspect-raw",
    "command": cmd,
    "frequency": "* * * * *",
    "container": "u13nbir4b0le8gl4dpjeuc1g",
    "timeout": 30,
    "enabled": True,
}
req = urllib.request.Request(
    f"{API}/applications/{APP}/scheduled-tasks",
    data=json.dumps(body).encode(),
    method="POST",
    headers=H,
)
resp = urllib.request.urlopen(req)
data = json.loads(resp.read())
uuid = data["uuid"]
print(f"Created task {uuid}")

print("Waiting 75s...")
time.sleep(75)

# Read execution
req = urllib.request.Request(
    f"{API}/applications/{APP}/scheduled-tasks/{uuid}/executions",
    headers=H,
)
execs = json.load(urllib.request.urlopen(req))
latest = sorted(execs, key=lambda x: x.get("started_at", ""))[-1]
print("status:", latest.get("status"), "duration:", latest.get("duration"))
msg = latest.get("message") or ""
print(f"msg length: {len(msg)}")

# Save raw output to file for inspection (avoid Windows console encoding issues)
out_path = "F:/Vibe Coding/marketing/.fb-raw-22may.json"
with open(out_path, "w", encoding="utf-8") as f:
    f.write(msg)
print(f"saved to {out_path}")

# Cleanup task
req = urllib.request.Request(
    f"{API}/applications/{APP}/scheduled-tasks/{uuid}",
    headers=H, method="DELETE",
)
print("delete:", urllib.request.urlopen(req).status)

# Parse and pretty-print key sections
try:
    rows = json.loads(msg)
    if rows and rows[0].get("d"):
        d = rows[0]["d"]
        print("\n=== endpoint ===", d.get("endpoint"))
        print("=== params ===", json.dumps(d.get("params", {}), indent=2, ensure_ascii=False)[:500])
        rs = d.get("responseSample", {})
        if isinstance(rs, dict) and "data" in rs:
            print(f"\n=== response data ({len(rs['data'])} metrics) ===")
            for metric in rs["data"]:
                print(f"\n>> {metric.get('name')}")
                values = metric.get("values", [])
                for v in values:
                    print(f"   end_time={v.get('end_time')}  value={v.get('value')}")
        else:
            print("responseSample:", str(rs)[:800])
    else:
        print("Empty result or different shape:", msg[:500])
except Exception as e:
    print("parse error:", e)
    print("msg first 500:", msg[:500])
