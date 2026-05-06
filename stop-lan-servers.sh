#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT/run-logs/lan-servers/pids"

if [[ ! -d "$PID_DIR" ]]; then
  echo "No PID dir: $PID_DIR"
  exit 0
fi

for pid_file in "$PID_DIR"/*.pid; do
  [[ -e "$pid_file" ]] || continue
  name="$(basename "$pid_file" .pid)"
  pid="$(cat "$pid_file")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name pid $pid"
    kill "$pid" 2>/dev/null || true
  else
    echo "$name not running"
  fi
  rm -f "$pid_file"
done
