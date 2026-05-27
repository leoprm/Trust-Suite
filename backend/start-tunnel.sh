#!/bin/bash
# ── TrustMaker Cloudflare Tunnel ──────────────────────────────────────────
# Lanza un túnel efímero de Cloudflare para exponer el puerto 3100.
# Escribe la URL del túnel a /tmp/trustmaker-tunnel-url para que el
# backend la use al configurar el webhook de Telegram.
#
# Fallback: si el túnel muere, el backend cae a polling.
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

PORT="${1:-3100}"
URL_FILE="/dev/shm/trustmaker-tunnel-url"
CLOUDFLARED="${CLOUDFLARED:-/home/leo/.local/bin/cloudflared}"

# Limpiar URL anterior
rm -f "$URL_FILE"

echo "[tunnel] Iniciando cloudflared tunnel para localhost:$PORT..."

# cloudflared tunnel --url escribe la URL a stderr.
# Buscamos el patrón https://*.trycloudflare.com
"$CLOUDFLARED" tunnel --url "http://localhost:$PORT" --no-autoupdate 2>&1 | while IFS= read -r line; do
  echo "[tunnel] $line"

  # Extraer URL del túnel
  if [[ "$line" =~ (https://[a-zA-Z0-9.-]+\.trycloudflare\.com) ]]; then
    TUNNEL_URL="${BASH_REMATCH[1]}"
    echo "$TUNNEL_URL" > "$URL_FILE"
    echo "[tunnel] ✅ URL capturada: $TUNNEL_URL"
  fi
done
