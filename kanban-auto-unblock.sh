#!/bin/bash
# kanban-auto-unblock.sh — Auto-unblock blocked kanban tasks (max 3 cycles)
# Runs as a cron job, no_agent=true, deliver=local
# Usage: KANBAN_DB_PATH=/path/to/kanban.db ./kanban-auto-unblock.sh

set -euo pipefail

DB_PATH="${KANBAN_DB_PATH:-/home/leo/.hermes/kanban.db}"

if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: DB not found at $DB_PATH" >&2
    exit 1
fi

python3 << 'PYEOF'
import sqlite3, json, sys, os
from datetime import datetime, timezone

db_path = os.environ.get('KANBAN_DB_PATH', '/home/leo/.hermes/kanban.db')

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
except Exception as e:
    print(f"ERROR: Cannot connect to DB: {e}", file=sys.stderr)
    sys.exit(1)

blocked = conn.execute(
    "SELECT id, title FROM tasks WHERE status='blocked'"
).fetchall()

if not blocked:
    # Silent exit — nothing to unblock (watchdog pattern)
    conn.close()
    sys.exit(0)

auto_unblocked = 0

for task in blocked:
    tid = task['id']
    title = task['title']

    # Count how many times this task has been blocked (completed block cycles)
    block_count = conn.execute(
        "SELECT COUNT(*) FROM task_events WHERE task_id=? AND kind='blocked'",
        (tid,)
    ).fetchone()[0]

    if block_count >= 3:
        print(f"SKIP {tid}: {block_count} blocks (max 3 cycles reached)", file=sys.stderr)
        continue

    now = int(datetime.now(timezone.utc).timestamp())

    # Unblock: set status back to 'ready'
    conn.execute("UPDATE tasks SET status='ready' WHERE id=?", (tid,))
    conn.execute(
        "INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?, 'unblocked', ?, ?)",
        (tid, json.dumps({
            'auto': True,
            'reason': f'auto-unblock cycle {block_count + 1}/3',
            'previous_blocks': block_count
        }), now)
    )

    print(f"UNBLOCKED {tid}: {title} (cycle {block_count + 1}/3)")
    auto_unblocked += 1

conn.commit()
conn.close()

if auto_unblocked == 0:
    print("No tasks eligible for auto-unblock (all at max cycles)")
PYEOF
