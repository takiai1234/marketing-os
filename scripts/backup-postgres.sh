#!/bin/sh
# backup-postgres.sh
#
# Daily Postgres backup via pg_dump inside the running postgres container.
# Output: /backup/YYYY-MM-DD.sql.gz
# Retention: 7 most recent files (older deleted automatically).
#
# Setup — add to root crontab on VPS:
#   0 4 * * * /opt/marketing-os/scripts/backup-postgres.sh >> /var/log/marketing-os-backup.log 2>&1
#
# Environment: reads /opt/marketing-os/.env.production for DB_USER and DB_NAME.
# Override by exporting DB_USER / DB_NAME / BACKUP_DIR before calling.

set -e

# ---------------------------------------------------------------------------
# Config — override via environment or edit defaults below
# ---------------------------------------------------------------------------
ENV_FILE="${ENV_FILE:-/opt/marketing-os/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/backup}"
CONTAINER="${CONTAINER:-marketing_os_db}"

# Source production env for DB_USER / DB_NAME if not already set
if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    . "$ENV_FILE"
  else
    echo "[backup] ERROR: $ENV_FILE not found and DB_USER/DB_NAME not set" >&2
    exit 1
  fi
fi

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  echo "[backup] ERROR: DB_USER and DB_NAME must be set" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Run backup
# ---------------------------------------------------------------------------
DATE=$(date +%F)
OUTFILE="${BACKUP_DIR}/${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') — dumping ${DB_NAME} → ${OUTFILE}"

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUTFILE"

echo "[backup] Done. Size: $(du -sh "$OUTFILE" | cut -f1)"

# ---------------------------------------------------------------------------
# Retention — delete backups older than 7 days
# ---------------------------------------------------------------------------
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +7 -delete
echo "[backup] Cleaned up backups older than 7 days"
