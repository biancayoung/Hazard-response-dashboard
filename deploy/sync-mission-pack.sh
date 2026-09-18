#!/usr/bin/env bash
# Copy this tree to a live device without a git checkout there.
# Never copies .git, .venv, farm.db, .env or keys. Never --delete.
#
#   ./deploy/sync-mission-pack.sh user@host:/path/on/device
#   ./deploy/sync-mission-pack.sh --dry-run user@host:/path/on/device
#   FARM_SYNC_HOST=user@host FARM_SYNC_DEST=/path/on/device ./deploy/sync-mission-pack.sh
#
# Host and destination are not stored here. Set them on the command line or in
# the environment. Restart the device service yourself after checking /ops.

set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exclude="$root/deploy/rsync-exclude"
host="${FARM_SYNC_HOST:-}"
dry_run=0

usage() {
  cat <<EOF
Usage: $0 [--dry-run] [user@host:]DEST

DEST is the directory that already runs bridge.py.
This only updates files. It does not restart systemd, touch farm.db,
or install a unit. Host and path come from the argument or from
FARM_SYNC_HOST / FARM_SYNC_DEST.

Examples:
  $0 --dry-run user@host:/opt/fabfarm/current
  $0 user@host:/opt/fabfarm/current
  FARM_SYNC_HOST=user@host FARM_SYNC_DEST=/opt/fabfarm/current $0
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -n|--dry-run) dry_run=1; shift ;;
    --) shift; break ;;
    -*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) break ;;
  esac
done

target="${1:-${FARM_SYNC_DEST:-}}"
if [[ -z "$target" ]]; then
  usage >&2
  echo >&2
  echo "Set DEST or FARM_SYNC_DEST to the live code directory on the device." >&2
  exit 2
fi

if [[ "$target" != *:* ]]; then
  if [[ -z "$host" ]]; then
    echo "Path without host: set FARM_SYNC_HOST or pass user@host:DEST." >&2
    exit 2
  fi
  target="$host:$target"
fi

rsync_opts=(-az)
if [[ "$dry_run" -eq 1 ]]; then
  rsync_opts+=(--dry-run)
fi
rsync "${rsync_opts[@]}" \
  --exclude-from="$exclude" \
  --exclude 'farm.db*' \
  --filter 'P farm.db' \
  --filter 'P farm.db-*' \
  --filter 'P .env' \
  --filter 'P .env.*' \
  "$root"/ "$target"/
echo "synced ${root}/ -> ${target}/"
echo "Restart the device service yourself after checking /ops."
