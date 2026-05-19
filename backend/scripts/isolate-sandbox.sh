#!/usr/bin/env bash
# ============================================================================
# isolate-sandbox.sh
# Bloquea outbound TCP a MySQL (3306) para el usuario trustmaker.
# Idempotente: verifica si las reglas ya existen antes de agregarlas.
#
# Uso:
#   sudo ./scripts/isolate-sandbox.sh
#
# Requiere: iptables con módulo owner (conntrack para IPv6 si aplica).
# ============================================================================
set -euo pipefail

SANDBOX_USER="trustmaker"
MYSQL_PORT="3306"
IPT4="iptables"
IPT6="ip6tables"

# ── Resolver UID del usuario sandbox ──────────────────────────────────────
if ! UID_SANDBOX=$(id -u "$SANDBOX_USER" 2>/dev/null); then
  echo "[isolate-sandbox] ERROR: usuario '$SANDBOX_USER' no existe. Abortando." >&2
  exit 1
fi

echo "[isolate-sandbox] Usuario: $SANDBOX_USER (UID=$UID_SANDBOX)"

# ── Verificar que iptables está disponible ─────────────────────────────────
if ! command -v "$IPT4" &>/dev/null; then
  echo "[isolate-sandbox] ERROR: $IPT4 no encontrado. Instala iptables." >&2
  exit 1
fi

# ── Verificar que el módulo owner está disponible ──────────────────────────
if ! $IPT4 -m owner --help &>/dev/null 2>&1; then
  echo "[isolate-sandbox] ERROR: módulo 'owner' de iptables no disponible." >&2
  exit 1
fi

# ── Función auxiliar: agregar regla si no existe ──────────────────────────
ensure_rule() {
  local ipt="$1"
  local dest="$2"
  local desc="$3"

  if $ipt -C OUTPUT -p tcp -d "$dest" --dport "$MYSQL_PORT" \
       -m owner --uid-owner "$SANDBOX_USER" -j DROP 2>/dev/null; then
    echo "[isolate-sandbox] Regla ya existe: $desc — skipping."
  else
    echo "[isolate-sandbox] Agregando regla: $desc ..."
    $ipt -I OUTPUT -p tcp -d "$dest" --dport "$MYSQL_PORT" \
         -m owner --uid-owner "$SANDBOX_USER" -j DROP
    echo "[isolate-sandbox] Regla agregada: $desc"
  fi
}

# ── Bloquear IPv4 localhost ──────────────────────────────────────────────
ensure_rule "$IPT4" "127.0.0.1" "IPv4 127.0.0.1:3306 → DROP (uid=$SANDBOX_USER)"

# ── Bloquear IPv6 localhost (si ip6tables está disponible) ────────────────
if command -v "$IPT6" &>/dev/null && $IPT6 -m owner --help &>/dev/null 2>&1; then
  ensure_rule "$IPT6" "::1" "IPv6 ::1:3306 → DROP (uid=$SANDBOX_USER)"
else
  echo "[isolate-sandbox] ip6tables no disponible o sin módulo owner — saltando IPv6."
fi

echo "[isolate-sandbox] Done."
