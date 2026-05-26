#!/bin/sh
# restore-postgres.sh
#
# Restore a Postgres database from a gzipped pg_dump backup file.
#
# Usage: ./scripts/restore-postgres.sh /backup/2025-05-01.sql.gz
#
# WARNING: This drops ALL existing data in DB_NAME before restoring.
#          Only run in a maintenance window. Stop the app container first:
#            docker compose stop app
#          Then restore, then restart:
#            docker compose start app

set -e

# ---------------------------------------------------------------------------
# Usage check
# ---------------------------------------------------------------------------
if [ -z "$1" ]; then
  echo "Usage: $0 <path-to-backup.sql.gz>" >&2
  echo "Example: $0 /backup/2025-05-01.sql.gz" >&2
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] ERROR: Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Config — source env if DB_USER / DB_NAME not already set
# ---------------------------------------------------------------------------
ENV_FILE="${ENV_FILE:-/opt/marketing-os/.env.production}"
CONTAINER="${CONTAINER:-marketing_os_db}"

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    . "$ENV_FILE"
  else
    echo "[restore] ERROR: $ENV_FILE not found and DB_USER/DB_NAME not set" >&2
    exit 1
  fi
fi

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  echo "[restore] ERROR: DB_USER and DB_NAME must be set" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Confirm before proceeding — destructive operation
# ---------------------------------------------------------------------------
echo "[restore] WARNING: This will OVERWRITE all data in '${DB_NAME}' on container '${CONTAINER}'."
echo "[restore] Backup file: ${BACKUP_FILE}"
printf "[restore] Type 'yes' to continue: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "[restore] Aborted."
  exit 0
fi

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
echo "[restore] $(date '+%Y-%m-%d %H:%M:%S') — restoring ${DB_NAME} from ${BACKUP_FILE}"

gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" "$DB_NAME"

echo "[restore] Restore complete."
