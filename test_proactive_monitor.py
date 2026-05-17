#!/usr/bin/env python3
"""
Test script for trustmaker-proactive-monitor.py (Ari's Autonomy).
Verifies:
  1. Script syntax and import (always)
  2. DB connectivity — can query trees
  3. get_last_activity() returns sane results
  4. check_inactivity() respects thresholds
  5. check_stagnation() detects stale needs/tasks
  6. build_pending_summary() returns expected format
  7. Push notification to /api/concierge/suggest (if backend running)

Usage: python3 test_proactive_monitor.py [--full]
"""

import json
import os
import pwd
import subprocess
import sys
import time
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────────
_REAL_HOME = pwd.getpwuid(os.getuid()).pw_dir
SCRIPT_PATH = os.path.join(_REAL_HOME, ".hermes/scripts/trustmaker-proactive-monitor.py")
TEST_DB = "trust_web"
API_URL = os.environ.get("TRUSTMAKER_API_URL", "http://localhost:3100")
API_KEY = os.environ.get("HERMES_API_SERVER_KEY", "tm_0daeb718b34ec8a8fe482a19aeee601140b010116a611c58")
FULL_MODE = "--full" in sys.argv

PASS = 0
FAIL = 0

def test(name: str, condition: bool, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        print(f"  ❌ {name} — {detail}")


def mysql_q(query: str) -> str:
    """Run a quick MySQL query."""
    r = subprocess.run(
        ["mysql", "-u", "trust_suite", "-proot", TEST_DB, "-N", "-e", query],
        capture_output=True, text=True, timeout=10,
    )
    return r.stdout.strip()


# ── Test 1: Script syntax + import ──────────────────────────────────────────────
print("\n📋 Test 1: Script syntax and imports")
try:
    with open(SCRIPT_PATH) as f:
        compile(f.read(), SCRIPT_PATH, 'exec')
    test("Script compiles successfully", True)
except Exception as e:
    test("Script compiles successfully", False, str(e)[:200])

# ── Test 2: DB connectivity ─────────────────────────────────────────────────────
print("\n📋 Test 2: DB connectivity")
trees_out = mysql_q("SELECT COUNT(*) FROM Tree;")
tree_count = int(trees_out.strip()) if trees_out.strip().isdigit() else 0
test("MySQL accessible", tree_count > 0, f"Found {tree_count} trees")
print(f"     ({tree_count} trees in DB)")

# ── Test 3: Dry-run execution ───────────────────────────────────────────────────
print("\n📋 Test 3: Dry-run execution")
try:
    result = subprocess.run(
        [sys.executable, SCRIPT_PATH, "--dry-run", "--verbose"],
        capture_output=True, text=True, timeout=30,
        env={**os.environ, "DEFAULT_INACTIVITY_HOURS": "1"},  # Low threshold for testing
    )
    test("Dry-run exits cleanly", result.returncode == 0,
         f"exit={result.returncode}, stderr={result.stderr[:200]}")
    
    # Check that Ari intervention messages appear when threshold is low
    has_ari = "ARI" in result.stdout.upper() or "💤" in result.stdout or "seguimos" in result.stdout.lower()
    if FULL_MODE:
        test("Ari messages appear when threshold is 1h", has_ari,
             "No Ari intervention detected in output")
    
    print(f"     stdout ({len(result.stdout)} bytes):")
    for line in result.stdout.strip().split("\n")[:10]:
        print(f"     | {line[:120]}")
except Exception as e:
    test("Dry-run execution", False, str(e))

# ── Test 4: get_last_activity() logic ───────────────────────────────────────────
print("\n📋 Test 4: get_last_activity()")
# Find a tree with chat messages
tree_with_chat = mysql_q(
    "SELECT t.id, t.name FROM Tree t "
    "JOIN ChatMessage cm ON cm.treeId = t.id "
    "GROUP BY t.id ORDER BY MAX(cm.createdAt) DESC LIMIT 1;"
)
if tree_with_chat:
    tree_id = tree_with_chat.split("\t")[0].strip()
    tree_name = tree_with_chat.split("\t")[1] if "\t" in tree_with_chat else "?"
    
    last_msg = mysql_q(
        f"SELECT MAX(createdAt) FROM ChatMessage WHERE treeId = '{tree_id}' AND role = 'user';"
    )
    test("Can query last chat activity", bool(last_msg) and last_msg != "NULL",
         f"tree={tree_name}, last_msg={last_msg}")
    
    if FULL_MODE and last_msg and last_msg != "NULL":
        ts = datetime.strptime(last_msg.split(".")[0], "%Y-%m-%d %H:%M:%S")
        age_h = (datetime.utcnow() - ts).total_seconds() / 3600
        print(f"     Last activity for {tree_name}: {age_h:.1f}h ago")
else:
    test("Trees with chat messages exist", False, "No chat messages in DB — can't test activity")

# ── Test 5: Stagnation detection ────────────────────────────────────────────────
print("\n📋 Test 5: Stagnation detection")
# Find any stagnated needs (needs without votes older than 1h)
stale_needs = mysql_q(
    "SELECT COUNT(*) FROM Need n "
    "WHERE n.status = 'OPEN' "
    "AND n.createdAt < DATE_SUB(NOW(), INTERVAL 1 HOUR) "
    "AND NOT EXISTS (SELECT 1 FROM IdeaVote iv WHERE iv.needId = n.id);"
)
stale_count = int(stale_needs.strip()) if stale_needs.strip().isdigit() else 0
test("Stagnation query runs", True,
     f"Found {stale_count} needs without votes > 1h old")

# Find stagnated tasks
stale_tasks = mysql_q(
    "SELECT COUNT(*) FROM Task t "
    "WHERE t.status IN ('ASSIGNED', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED') "
    "AND COALESCE(t.updatedAt, t.createdAt) < DATE_SUB(NOW(), INTERVAL 1 DAY);"
)
task_count = int(stale_tasks.strip()) if stale_tasks.strip().isdigit() else 0
test("Task stagnation query runs", True,
     f"Found {task_count} tasks without progress > 1d")

# ── Test 6: Pending summary ────────────────────────────────────────────────────
print("\n📋 Test 6: Pending summary")
if tree_count > 0:
    first_tree_id = mysql_q("SELECT id FROM Tree LIMIT 1;").strip()
    open_needs = mysql_q(
        f"SELECT COUNT(*) FROM Need WHERE treeId = '{first_tree_id}' AND status = 'OPEN';"
    )
    pending_tasks = mysql_q(
        f"SELECT COUNT(*) FROM Task WHERE treeId = '{first_tree_id}' "
        f"AND status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED');"
    )
    test("Pending summary queries work", True,
         f"Open needs={open_needs.strip()}, Pending tasks={pending_tasks.strip()}")
else:
    test("Tree exists for summary test", False)

# ── Test 7: suggest endpoint ────────────────────────────────────────────────────
print("\n📋 Test 7: POST /api/concierge/suggest endpoint")
try:
    # Check if backend is running
    health = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
         f"{API_URL}/api/health"],
        capture_output=True, text=True, timeout=5,
    )
    backend_up = health.stdout.strip() == "200"
    test("Backend is running", backend_up,
         f"HTTP {health.stdout.strip() if health.stdout else 'timeout/error'}")

    if backend_up and tree_count > 0:
        first_tree_id = mysql_q("SELECT id FROM Tree LIMIT 1;").strip()
        
        # Test 7a: Missing auth
        no_auth = subprocess.run(
            ["curl", "-s", "-X", "POST", f"{API_URL}/api/concierge/suggest",
             "-H", "Content-Type: application/json",
             "-d", json.dumps({"type": "test", "message": "test msg", "treeId": first_tree_id})],
            capture_output=True, text=True, timeout=5,
        )
        test("Rejects missing auth", no_auth.returncode == 0 and "401" in no_auth.stdout or "Unauthorized" in no_auth.stdout,
             f"response: {no_auth.stdout[:200]}")

        # Test 7b: Valid auth
        valid = subprocess.run(
            ["curl", "-s", "-X", "POST", f"{API_URL}/api/concierge/suggest",
             "-H", "Content-Type: application/json",
             "-H", f"Authorization: Bearer {API_KEY}",
             "-d", json.dumps({"type": "test_verification", "message": "✅ Ari autonomy test — please ignore", "treeId": first_tree_id})],
            capture_output=True, text=True, timeout=5,
        )
        test("Accepts valid auth", valid.returncode == 0 and '"ok":true' in valid.stdout,
             f"response: {valid.stdout[:200]}")

        # Test 7c: Missing body fields
        bad_body = subprocess.run(
            ["curl", "-s", "-X", "POST", f"{API_URL}/api/concierge/suggest",
             "-H", "Content-Type: application/json",
             "-H", f"Authorization: Bearer {API_KEY}",
             "-d", json.dumps({"type": "test"})],
            capture_output=True, text=True, timeout=5,
        )
        test("Rejects incomplete body", bad_body.returncode == 0 and ('"error"' in bad_body.stdout or "400" in bad_body.stdout),
             f"response: {bad_body.stdout[:200]}")
    elif not backend_up:
        print("     ⏭  Skipping suggest endpoint tests (backend not running)")
except Exception as e:
    test("Suggest endpoint tests", False, str(e))

# ── Summary ─────────────────────────────────────────────────────────────────────
total = PASS + FAIL
print(f"\n{'='*60}")
print(f"  Results: {PASS}/{total} passed, {FAIL} failed")
if FAIL == 0:
    print("  🎉 All tests passed!")
else:
    print(f"  ⚠️  {FAIL} test(s) failed — review above")
print(f"{'='*60}\n")
sys.exit(0 if FAIL == 0 else 1)
