#!/usr/bin/env bash
# E2E Test: Ari Cross-Tree Task Orchestration
# Tests: lazy-init -> write comment -> read back -> trigger review -> kanban create
# Run: bash tests/e2e-orchestration.sh
set -euo pipefail

API_BASE="http://localhost:3100"
API_KEY="Bearer tm_0daeb718b34ec8a8fe482a19aeee601140b010116a611c58"
TREE_ID="24b1a33c-e3ee-4188-9ca1-417e0f4c2ca6"
PASS=0
FAIL=0

green() { echo -e "\033[32m  PASS\033[0m $1"; PASS=$((PASS+1)); }
red()   { echo -e "\033[31m  FAIL\033[0m $1"; FAIL=$((FAIL+1)); }

echo "=============================================="
echo "  E2E Test: Ari Task Orchestration"
echo "  Tree: $TREE_ID"
echo "=============================================="
echo ""

# Helper: call sandbox read API
sandbox_read() {
  curl -s -X POST "${API_BASE}/api/trees/${TREE_ID}/sandbox/read" \
    -H "Authorization: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"path\": \"$1\"}"
}

# Helper: call sandbox write API
sandbox_write() {
  curl -s -o /tmp/e2e_http_code.txt -w "%{http_code}" -X POST \
    "${API_BASE}/api/trees/${TREE_ID}/sandbox/write" \
    -H "Authorization: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"path\": \"$1\", \"content\": \"$2\"}"
}

# ------------------------------------------------------------
# 1. LAZY-INIT: Read comentarios.md (should auto-create)
# ------------------------------------------------------------
echo "--- 1. Lazy-init: read obsidian/comentarios.md ---"
RESP=$(sandbox_read "obsidian/comentarios.md")

if echo "$RESP" | grep -q "Comentarios del"; then
  green "Lazy-init created comentarios.md with header"
else
  red "Lazy-init failed: $(echo "$RESP" | head -c 150)"
fi
echo ""

# ------------------------------------------------------------
# 2. WRITE: Append a simulated user message
# ------------------------------------------------------------
echo "--- 2. Write: append user message entry ---"

# Read current content, extract content field
CURRENT=$(sandbox_read "obsidian/comentarios.md")
CURRENT_TEXT=$(echo "$CURRENT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('content',''))" 2>/dev/null || echo "$CURRENT")

NOW=$(date "+%d/%m %H:%M")
ENTRY="

---
### [${NOW}] @test_user
> necesitamos un script de backup para la DB
Estado: [pendiente]
Clasificacion: [sin clasificar]
---
"
NEW_CONTENT="${CURRENT_TEXT}${ENTRY}"

# Escape for JSON
ESCAPED=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$NEW_CONTENT" 2>/dev/null)
WRITE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${API_BASE}/api/trees/${TREE_ID}/sandbox/write" \
  -H "Authorization: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"path\":\"obsidian/comentarios.md\",\"content\":${ESCAPED}}")

if [ "$WRITE_CODE" = "201" ]; then
  green "Write entry to comentarios.md (HTTP ${WRITE_CODE})"
else
  red "Write failed: HTTP ${WRITE_CODE}"
fi
echo ""

# ------------------------------------------------------------
# 3. READ BACK: Verify the entry
# ------------------------------------------------------------
echo "--- 3. Read back: verify persistence ---"
READ_RESP=$(sandbox_read "obsidian/comentarios.md")

if echo "$READ_RESP" | grep -q "script de backup"; then
  green "Entry text found in comentarios.md"
else
  red "Entry not found"
fi

if echo "$READ_RESP" | grep -q "Estado.*pendiente"; then
  green "Estado: [pendiente] present"
else
  red "Estado [pendiente] missing"
fi
echo ""

# ------------------------------------------------------------
# 4. CLASSIFICATION: Update to ia
# ------------------------------------------------------------
echo "--- 4. Classification: update to ia ---"
HEADER="# Comentarios del arbol

Registro de mensajes accionables del grupo.
"
UPDATED_ENTRY="---
### [${NOW}] @test_user
> necesitamos un script de backup para la DB
Estado: [en progreso]
Clasificacion: ia -> backend-eng
Kanban: [creado]
---"
UPDATE_CONTENT="${HEADER}${UPDATED_ENTRY}"

ESCAPED2=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$UPDATE_CONTENT" 2>/dev/null)
UPDATE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${API_BASE}/api/trees/${TREE_ID}/sandbox/write" \
  -H "Authorization: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"path\":\"obsidian/comentarios.md\",\"content\":${ESCAPED2}}")

if [ "$UPDATE_CODE" = "201" ]; then
  green "Classification update written (HTTP ${UPDATE_CODE})"
else
  red "Classification update failed: HTTP ${UPDATE_CODE}"
fi

# Verify
VERIFY_RESP=$(sandbox_read "obsidian/comentarios.md")
if echo "$VERIFY_RESP" | grep -q "backend-eng"; then
  green "Classification 'ia -> backend-eng' verified"
else
  red "Classification not found"
fi
echo ""

# ------------------------------------------------------------
# 5. TRIGGER ENDPOINT: POST /api/bot/trigger-comment-review
# ------------------------------------------------------------
echo "--- 5. Trigger endpoint ---"
TRIGGER_RESP=$(curl -s -X POST "${API_BASE}/api/bot/trigger-comment-review" \
  -H "Authorization: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}')

if echo "$TRIGGER_RESP" | grep -q "triggered"; then
  green "Trigger endpoint responded"
else
  red "Trigger endpoint failed: $(echo "$TRIGGER_RESP" | head -c 100)"
fi

# With specific treeId
TRIGGER2=$(curl -s -X POST "${API_BASE}/api/bot/trigger-comment-review" \
  -H "Authorization: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"treeId\":\"${TREE_ID}\"}")

if echo "$TRIGGER2" | grep -q "triggered"; then
  green "Trigger with specific treeId responded"
else
  red "Trigger with treeId failed"
fi
echo ""

# ------------------------------------------------------------
# 6. KANBAN CREATE
# ------------------------------------------------------------
echo "--- 6. Kanban: create task via hermes CLI ---"
KANBAN_OUT=$(hermes kanban create "TT-E2E-TEST: Backup script para DB" \
  --assignee "backend-eng" \
  --workspace "dir:/home/leo/Documentos/TrustMaker/backend" \
  --body "Tarea de prueba E2E.\nOrigen: necesitamos un script de backup para la DB\nClasificacion: ia -> backend-eng" 2>&1 || echo "KANBAN_FAILED")

if echo "$KANBAN_OUT" | grep -qE 't_[a-f0-9]{8}'; then
  KANBAN_ID=$(echo "$KANBAN_OUT" | grep -oE 't_[a-f0-9]{8}' | head -1)
  green "Kanban task created: ${KANBAN_ID}"
else
  red "Kanban create failed: $(echo "$KANBAN_OUT" | head -c 200)"
fi
echo ""

# ------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------
TOTAL=$((PASS + FAIL))
echo "=============================================="
echo "  Results: ${PASS} passed, ${FAIL} failed (${TOTAL} total)"
echo "=============================================="

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: Some tests failed"
  exit 1
else
  echo "PASS: All tests passed"
  exit 0
fi
