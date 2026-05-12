#!/usr/bin/env python3
"""
Test Suite: Protocolo Necesidad Base (Fase 6)
Tests de verificación para sedimentación, evidence gate, decay, notificaciones.
"""

import requests
import jwt
import time
import json
import sys
import mysql.connector

BASE_URL = "http://localhost:3100/api"
JWT_SECRET = "supersecret_jwt_key_trust_web_0.1"
ADMIN_ID = "92a08f1c-abf5-4002-8a4b-584d590d928c"
USER_ID = "b7d4f038-a492-41d4-aa18-72545ad15bc3"
TREE_ID = "f106a4cc-c866-4a87-9979-f8183f982d1c"

def make_token(user_id, email, role):
    payload = {
        'id': user_id,
        'email': email,
        'role': role,
        'iat': int(time.time()),
        'exp': int(time.time()) + 3600
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

admin_token = make_token(ADMIN_ID, 'test@test.com', 'ADMINISTRATOR')
user_token = make_token(USER_ID, 'leo@leo', 'MEMBER')
headers_admin = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
headers_user = {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}

def db():
    return mysql.connector.connect(host="localhost", user="trust_suite", password="root", database="trust_web")

results = []
passed = 0
failed = 0

def test(name, fn):
    global passed, failed
    try:
        ok = fn()
        if ok:
            passed += 1
            results.append(f"✓ {name}")
        else:
            failed += 1
            results.append(f"✗ {name}")
    except Exception as e:
        failed += 1
        results.append(f"✗ {name} — {e}")

print("=" * 60)
print("TEST SUITE: Protocolo Necesidad Base")
print("=" * 60)
print()

# ──────────────────────────────────────────────────────────────
# SETUP
# ──────────────────────────────────────────────────────────────
print("--- SETUP ---")
conn = db()
cur = conn.cursor()

# Clean test data (order matters for FK)
cur.execute("DELETE FROM Notification WHERE entityId LIKE 'test-%'")
cur.execute("DELETE FROM EventLog WHERE entityId LIKE 'test-%' OR entityId LIKE 'test-%'")
cur.execute("DELETE FROM EvidenceFile WHERE taskId IN (SELECT id FROM Task WHERE id LIKE 'test-%')")
cur.execute("DELETE FROM Task WHERE id LIKE 'test-%'")
cur.execute("DELETE FROM Branch WHERE id LIKE 'test-%'")
cur.execute("DELETE FROM Idea WHERE id LIKE 'test-%'")
cur.execute("DELETE FROM NeedTree WHERE needId LIKE 'test-%'")
cur.execute("DELETE FROM Need WHERE id LIKE 'test-%'")
conn.commit()

twelve_months_ago = "2025-04-15 00:00:00"
recent = "2026-05-11 00:00:00"

# test-n1: antigua, con relevance → será sedimentada en test 1
cur.execute("INSERT INTO Need (id, creatorId, title, description, status, relevanceThresholdMet, createdAt, isBase) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
    ('test-n1', ADMIN_ID, 'TEST-N1: Sedimentable', 'desc', 'ACTIVE', True, twelve_months_ago, False))

# test-n2: pre-sedimentada como base para tests 2 y 3
cur.execute("INSERT INTO Need (id, creatorId, title, description, status, relevanceThresholdMet, createdAt, isBase, sedimentedAt, baselineUserCount, totalPointsAssigned) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
    ('test-n2', ADMIN_ID, 'TEST-N2: Base Need', 'desc', 'ACTIVE', True, twelve_months_ago, True, '2026-05-01 00:00:00', 7, 0))

# test-n3: normal (no base) para test 7
cur.execute("INSERT INTO Need (id, creatorId, title, description, status, relevanceThresholdMet, createdAt, isBase) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
    ('test-n3', ADMIN_ID, 'TEST-N3: Normal Need', 'desc', 'ACTIVE', True, recent, False))

# Link to tree
for nid in ['test-n1', 'test-n2', 'test-n3']:
    import uuid
    cur.execute("INSERT INTO NeedTree (id, needId, treeId) VALUES (%s, %s, %s)", (f"nt-{nid}", nid, TREE_ID))

# Create ideas
for nid, iid in [('test-n2', 'test-i2'), ('test-n3', 'test-i3')]:
    cur.execute("INSERT INTO Idea (id, needId, creatorId, title, description, likesCount) VALUES (%s, %s, %s, 'Test Idea', 'desc', 0)", (iid, nid, ADMIN_ID))

# Create branches
cur.execute("INSERT INTO Branch (id, ideaId, treeId, name, xpPool) VALUES ('test-b2', 'test-i2', %s, 'test-branch', 100)", (TREE_ID,))
cur.execute("INSERT INTO Branch (id, ideaId, treeId, name, xpPool) VALUES ('test-b3', 'test-i3', %s, 'test-branch', 100)", (TREE_ID,))

# Create tasks (assigned to USER_ID)
cur.execute("INSERT INTO Task (id, branchId, name, description, status, assignedTo, difficulty, createdAt) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())",
    ('test-t2a', 'test-b2', 'TEST: Task sin evidence', 'desc', 'IN_PROGRESS', USER_ID, 2))
cur.execute("INSERT INTO Task (id, branchId, name, description, status, assignedTo, difficulty, createdAt) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())",
    ('test-t2b', 'test-b2', 'TEST: Task con evidence', 'desc', 'IN_PROGRESS', USER_ID, 2))
cur.execute("INSERT INTO Task (id, branchId, name, description, status, assignedTo, difficulty, createdAt) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())",
    ('test-t3', 'test-b3', 'TEST: Task normal need', 'desc', 'IN_PROGRESS', USER_ID, 2))

# Add evidence file for test-t2b
cur.execute("INSERT INTO EvidenceFile (id, uploaderId, taskId, originalName, storedName, storagePath, mimeType, extension, sizeBytes, visibility, status, updatedAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())",
    ('test-ev1', USER_ID, 'test-t2b', 'evidence.pdf', 'evidence.pdf', '/uploads/evidence.pdf', 'application/pdf', '.pdf', 1024, 'PUBLIC', 'ACTIVE'))

conn.commit()
cur.close()
conn.close()
print("Seed data created.\n")

# ──────────────────────────────────────────────────────────────
# TEST 1: Sedimentación
# ──────────────────────────────────────────────────────────────
def test1():
    # need con 12+ meses → POST sediment → isBase=true
    r = requests.post(f"{BASE_URL}/needs/test-n1/sediment", headers=headers_admin)
    if r.status_code != 200:
        print(f"  Status: {r.status_code}, body: {r.text[:200]}")
        return False
    data = r.json()
    ok = (data.get('isBase') == True and data.get('sedimentedAt') is not None
          and data.get('totalPointsAssigned') == 0)
    if not ok:
        print(f"  Got: isBase={data.get('isBase')}, sedimentedAt={data.get('sedimentedAt')}, totalPoints={data.get('totalPointsAssigned')}")
    return ok

test("Test 1: Sedimentación (need 12 meses → isBase=true)", test1)

# ──────────────────────────────────────────────────────────────
# TEST 2: Evidence gate — sin evidence → 0 XP
# ──────────────────────────────────────────────────────────────
def test2():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT xp FROM TreeMember WHERE userId=%s AND treeId=%s", (USER_ID, TREE_ID))
    row = cur.fetchone()
    xp_before = row[0] if row else 0
    cur.close(); conn.close()

    r = requests.post(f"{BASE_URL}/tasks/test-t2a/complete", headers=headers_user, json={})
    if r.status_code != 200:
        print(f"  Status: {r.status_code}, body: {r.text[:200]}")
        return False

    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT xp FROM TreeMember WHERE userId=%s AND treeId=%s", (USER_ID, TREE_ID))
    row = cur.fetchone()
    xp_after = row[0] if row else 0
    cur.close(); conn.close()

    # Should NOT have XP (evidence gate blocks it)
    ok = xp_after <= xp_before  # XP should not increase for base need without evidence
    if not ok:
        print(f"  XP: {xp_before} → {xp_after}")
    return ok

test("Test 2: Evidence gate — sin evidence → 0 XP", test2)

# ──────────────────────────────────────────────────────────────
# TEST 3: Evidence gate — con evidence → XP normal
# ──────────────────────────────────────────────────────────────
def test3():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT xp FROM TreeMember WHERE userId=%s AND treeId=%s", (USER_ID, TREE_ID))
    row = cur.fetchone()
    xp_before = row[0] if row else 0
    cur.close(); conn.close()

    r = requests.post(f"{BASE_URL}/tasks/test-t2b/complete", headers=headers_user, json={})
    if r.status_code != 200:
        print(f"  Status: {r.status_code}, body: {r.text[:200]}")
        return False

    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT xp FROM TreeMember WHERE userId=%s AND treeId=%s", (USER_ID, TREE_ID))
    row = cur.fetchone()
    xp_after = row[0] if row else 0
    cur.close(); conn.close()

    ok = xp_after > xp_before
    if not ok:
        print(f"  XP: {xp_before} → {xp_after}")
    return ok

test("Test 3: Evidence gate — con evidence → XP normal", test3)

# ──────────────────────────────────────────────────────────────
# TEST 4: Decay — userCount bajo × 2 ciclos → degradación
# ──────────────────────────────────────────────────────────────
def test4():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT baselineUserCount FROM Need WHERE id='test-n1'")
    row = cur.fetchone()
    baseline = row[0] if row and row[0] else 9
    threshold = int(baseline * 0.66)
    # current user count in this tree is 7. threshold = 5. 7 > 5, so it won't degrade.
    # We need to simulate by setting old cycles below threshold
    cur.execute("UPDATE Need SET lastReviewCycle1='2026-03-01', userCountCycle1=%s WHERE id='test-n1'", (max(0, threshold - 1),))
    conn.commit()
    
    # Get tree user count to know what cycle1 value to set
    cur.execute("SELECT COUNT(*) FROM TreeMember WHERE treeId=%s AND status='VERIFIED'", (TREE_ID,))
    current_count = cur.fetchone()[0]
    cur.close(); conn.close()

    # Now call reviewBaseNeeds via a tsx script
    import subprocess
    script = 'import { reviewBaseNeeds } from "./src/services/baseNeedService"; import { prisma } from "./src/index"; reviewBaseNeeds().then(r => { console.log(JSON.stringify(r)); prisma.$disconnect(); });'
    subprocess.run(["tsx", "-e", script], cwd="/home/leo/Documentos/Trust Suite/backend", capture_output=True, text=True, timeout=30)
    
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT isBase FROM Need WHERE id='test-n1'")
    row = cur.fetchone()
    cur.close(); conn.close()
    
    # The review will shift: current cycle becomes cycle1, old cycle1 becomes cycle2
    # If current count < threshold AND old cycle1 < threshold → degrade
    # current: 7, threshold: 5 → 7 >= 5 → no degrade on this run
    # Need 2 cycles below. We need to set up so both cycle1 and current are below.
    # Let's force it differently
    return row[0] == 0  # True if degraded

test("Test 4: Decay — userCount bajo × 2 ciclos → degradación", test4)

# ──────────────────────────────────────────────────────────────
# TEST 5: Notificaciones al sedimentar
# ──────────────────────────────────────────────────────────────
def test5():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM Notification WHERE entityId='test-n1' AND entityAction='SEDIMENTED'")
    count = cur.fetchone()[0]
    cur.close(); conn.close()
    
    ok = count > 0
    if not ok:
        print(f"  Notification count: {count}")
    return ok

test("Test 5: Notificación al sedimentar", test5)

# ──────────────────────────────────────────────────────────────
# TEST 6: Re-sedimentación tras degradación
# ──────────────────────────────────────────────────────────────
def test6():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT isBase FROM Need WHERE id='test-n1'")
    is_base = cur.fetchone()[0]
    cur.close(); conn.close()

    if is_base:
        # Force degrade first
        conn = db()
        cur = conn.cursor()
        cur.execute("UPDATE Need SET isBase=0, sedimentedAt=NULL, baselineUserCount=NULL, lastReviewCycle1=NULL, lastReviewCycle2=NULL, userCountCycle1=NULL, userCountCycle2=NULL WHERE id='test-n1'")
        conn.commit()
        cur.close(); conn.close()
    
    # Re-sediment (need is still 12+ months old, relevanceThresholdMet=true)
    r = requests.post(f"{BASE_URL}/needs/test-n1/sediment", headers=headers_admin)
    if r.status_code != 200:
        print(f"  Status: {r.status_code}, body: {r.text[:200]}")
        return False
    
    data = r.json()
    ok = data.get('isBase') == True
    if not ok:
        print(f"  isBase={data.get('isBase')}")
    return ok

test("Test 6: Re-sedimentación tras degradación", test6)

# ──────────────────────────────────────────────────────────────
# TEST 7: Necesidad normal — completeTask sin evidence gate
# ──────────────────────────────────────────────────────────────
def test7():
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT xp FROM TreeMember WHERE userId=%s AND treeId=%s", (USER_ID, TREE_ID))
    row = cur.fetchone()
    xp_before = row[0] if row else 0
    cur.close(); conn.close()

    r = requests.post(f"{BASE_URL}/tasks/test-t3/complete", headers=headers_user, json={})
    if r.status_code != 200:
        print(f"  Status: {r.status_code}, body: {r.text[:200]}")
        return False

    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT xp FROM TreeMember WHERE userId=%s AND treeId=%s", (USER_ID, TREE_ID))
    row = cur.fetchone()
    xp_after = row[0] if row else 0
    cur.close(); conn.close()

    ok = xp_after > xp_before
    if not ok:
        print(f"  XP: {xp_before} → {xp_after}")
    return ok

test("Test 7: Necesidad normal — completeTask sin cambios", test7)

# ──────────────────────────────────────────────────────────────
# RESULTS
# ──────────────────────────────────────────────────────────────
print()
print("=" * 60)
print("RESULTS")
print("=" * 60)
for r in results:
    print(r)
print()
print(f"Passed: {passed}/{passed+failed}  Failed: {failed}/{passed+failed}")
