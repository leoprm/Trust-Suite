#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
ENV_FILE="$BACKEND_DIR/.env"
APP_DB_USER="${TRUST_SUITE_DB_USER:-trust_suite}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: No existe $ENV_FILE" >&2
  exit 1
fi

if ! command -v mysql >/dev/null 2>&1; then
  echo "ERROR: mysql client no está instalado. Instala mysql-server primero." >&2
  exit 1
fi

TMP_SQL="$(mktemp)"
TMP_ENV="$(mktemp)"
cleanup() {
  rm -f "$TMP_SQL" "$TMP_ENV"
}
trap cleanup EXIT

python3 - "$ENV_FILE" "$TMP_SQL" "$TMP_ENV" "$APP_DB_USER" <<'PY'
from pathlib import Path
from urllib.parse import urlparse, urlunparse, quote
import sys

env_path = Path(sys.argv[1])
sql_path = Path(sys.argv[2])
out_env_path = Path(sys.argv[3])
app_user = sys.argv[4]

lines = env_path.read_text(errors='ignore').splitlines()
db_url = None
for line in lines:
    if line.startswith('DATABASE_URL='):
        db_url = line.split('=', 1)[1].strip().strip('"').strip("'")
        break
if not db_url:
    raise SystemExit('ERROR: DATABASE_URL no está definido en backend/.env')

u = urlparse(db_url)
if u.scheme != 'mysql':
    raise SystemExit(f'ERROR: DATABASE_URL no es mysql:// sino {u.scheme!r}')
if not u.password:
    raise SystemExit('ERROR: DATABASE_URL no tiene password; no crearé usuario sin contraseña')

db_name = (u.path or '').lstrip('/')
if not db_name:
    raise SystemExit('ERROR: DATABASE_URL no contiene nombre de base de datos')

# SQL escaping for quoted identifiers/literals.
def ident(s: str) -> str:
    return '`' + s.replace('`', '``') + '`'

def lit(s: str) -> str:
    return "'" + s.replace('\\', '\\\\').replace("'", "''") + "'"

password = u.password
sql = f"""
CREATE DATABASE IF NOT EXISTS {ident(db_name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS {lit(app_user)}@'localhost' IDENTIFIED BY {lit(password)};
ALTER USER {lit(app_user)}@'localhost' IDENTIFIED BY {lit(password)};
CREATE USER IF NOT EXISTS {lit(app_user)}@'127.0.0.1' IDENTIFIED BY {lit(password)};
ALTER USER {lit(app_user)}@'127.0.0.1' IDENTIFIED BY {lit(password)};
GRANT ALL PRIVILEGES ON {ident(db_name)}.* TO {lit(app_user)}@'localhost';
GRANT ALL PRIVILEGES ON {ident(db_name)}.* TO {lit(app_user)}@'127.0.0.1';
FLUSH PRIVILEGES;
""".strip() + "\n"
sql_path.write_text(sql)

# Rewrite only DATABASE_URL username to app user, preserving password/host/port/db/query.
netloc = ''
if u.username:
    netloc += quote(app_user, safe='')
    if u.password is not None:
        netloc += ':' + quote(u.password, safe='')
    netloc += '@'
netloc += u.hostname or 'localhost'
if u.port:
    netloc += f':{u.port}'
new_url = urlunparse((u.scheme, netloc, u.path, u.params, u.query, u.fragment))

new_lines = []
for line in lines:
    if line.startswith('DATABASE_URL='):
        new_lines.append(f'DATABASE_URL="{new_url}"')
    else:
        new_lines.append(line)
out_env_path.write_text('\n'.join(new_lines) + '\n')
print(f'DB: {db_name}')
print(f'Usuario MySQL app: {app_user}')
print('Password: [leída desde backend/.env, no impresa]')
PY

echo "Aplicando configuración MySQL con sudo..."
sudo mysql < "$TMP_SQL"

cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
cp "$TMP_ENV" "$ENV_FILE"
echo "backend/.env actualizado: DATABASE_URL ahora usa usuario $APP_DB_USER (password preservada, no impresa)."

echo "Probando conexión DB desde DATABASE_URL..."
python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlparse
import subprocess, os, sys
val = None
for line in Path('backend/.env').read_text(errors='ignore').splitlines():
    if line.startswith('DATABASE_URL='):
        val = line.split('=',1)[1].strip().strip('"').strip("'")
        break
u = urlparse(val)
env = os.environ.copy()
env['MYSQL_PWD'] = u.password or ''
cmd = ['mysql', '-h', u.hostname or 'localhost', '-P', str(u.port or 3306), '-u', u.username or '', '-e', f'SELECT 1; USE `{(u.path or "").lstrip("/")}`; SHOW TABLES;']
res = subprocess.run(cmd, env=env, text=True, capture_output=True)
if res.returncode != 0:
    print((res.stderr or res.stdout).strip())
    sys.exit(res.returncode)
print('Conexión MySQL OK')
PY

echo "Aplicando migraciones Prisma..."
(
  cd "$BACKEND_DIR"
  node ./node_modules/prisma/build/index.js generate
  node ./node_modules/prisma/build/index.js migrate deploy
)

echo "Reiniciando Trust Suite LAN..."
(
  cd "$ROOT_DIR"
  ./stop-lan-servers.sh || true
  # liberar posible backend huérfano en 3100
  pids=$(ss -ltnp | sed -n 's/.*:3100 .*pid=\([0-9]*\).*/\1/p' | sort -u || true)
  for p in $pids; do
    echo "Matando proceso huérfano en 3100: $p"
    kill "$p" 2>/dev/null || true
  done
  sleep 1
  ./start-lan-servers.sh
)

echo "Listo. Verifica health: http://$(hostname -I | awk '{print $1}'):3100/api/health"
