#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
LOG_DIR="$ROOT/run-logs/lan-servers"
PID_DIR="$ROOT/run-logs/lan-servers/pids"
LAN_IP="${TRUST_SUITE_LAN_IP:-$(hostname -I | awk '{print $1}')}"
API_PORT="${TRUST_SUITE_API_PORT:-3100}"
API_URL="http://${LAN_IP}:${API_PORT}/api"

mkdir -p "$LOG_DIR" "$PID_DIR"

start_process() {
  local name="$1"
  local dir="$2"
  shift 2
  local pid_file="$PID_DIR/${name}.pid"
  local log_file="$LOG_DIR/${name}.log"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name already running: pid $(cat "$pid_file")"
    return 0
  fi

  echo "Starting $name..."
  (
    cd "$dir"
    exec "$@"
  ) >"$log_file" 2>&1 &
  echo $! > "$pid_file"
  echo "$name pid $(cat "$pid_file") log $log_file"
}

start_process api "$BACKEND_DIR" env PORT="$API_PORT" npx tsx src/index.ts
start_process trust-lite "$FRONTEND_DIR" node ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173 --strictPort --mode trust-lite
start_process branch-os "$FRONTEND_DIR" node ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5174 --strictPort --mode branch-os
start_process trace-lite "$FRONTEND_DIR" node ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5175 --strictPort --mode trace-lite

echo
echo "Trust Suite LAN URLs:"
echo "  API health:  http://${LAN_IP}:${API_PORT}/api/health"
echo "  Trust Lite:  http://${LAN_IP}:5173"
echo "  Branch OS:   http://${LAN_IP}:5174"
echo "  Trace Lite:  http://${LAN_IP}:5175"
echo
echo "Logs: $LOG_DIR"
echo "Stop: $ROOT/stop-lan-servers.sh"
