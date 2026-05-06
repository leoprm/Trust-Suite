#!/bin/bash
# Trust Suite - Clean script for sharing / ZIP export
# Run this before sending the repo to third parties, red teams, or external devs.
#
# Usage: bash clean.sh            # clean working tree only
#        bash clean.sh --hard     # also delete .git (for bare ZIP export)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

echo "=== Trust Suite Cleaner ==="
echo ""

# ── 1. Delete log files ────────────────────────────────────────────────
echo "[1/6] Removing log files..."
find . -maxdepth 3 \( -name "*.log" -o -name "*_debug*" -o -name "*_error*" \
    -o -name "crash*" -o -name "diag*" -o -name "err*" -o -name "val_err*" \
    -o -name "tsc_*" -o -name "prisma_error*" -o -name "prisma_full*" \
    -o -name "build_error*" -o -name "frontend_log*" -o -name "backend_log*" \
    -o -name "backend_start*" -o -name "backend_full*" -o -name "tsc_debug*" \
    -o -name "backend_debug*" \) \
    -not -path "*/node_modules/*" \
    -exec rm -f {} \; 2>/dev/null || true

# ── 2. Remove temporary/scratch scripts ─────────────────────────────────
echo "[2/6] Removing temp files..."
rm -rf backend/tmp/ 2>/dev/null || true
find . -name "cleanup_votes*" -o -name "fix_tree_creators*" \
    -not -path "*/node_modules/*" \
    -exec rm -f {} \; 2>/dev/null || true

# ── 3. Remove runtime artifacts ─────────────────────────────────────────
echo "[3/6] Removing runtime artifacts..."
rm -rf run-logs/ 2>/dev/null || true
find . -name "*.pid" -not -path "*/node_modules/*" -exec rm -f {} \; 2>/dev/null || true
find . -name "tsconfig.tsbuildinfo" -not -path "*/node_modules/*" \
    -exec rm -f {} \; 2>/dev/null || true

# ── 4. Remove env backups ───────────────────────────────────────────────
echo "[4/6] Removing .env backups..."
find . -name ".env.bak*" -not -path "*/node_modules/*" \
    -exec rm -f {} \; 2>/dev/null || true

# ── 5. Wipe uploads (evidence files, profile pics) ──────────────────────
echo "[5/6] Wiping uploads..."
find backend/uploads -type f ! -name '.gitkeep' -exec rm -f {} \; 2>/dev/null || true

# ── 6. Remove Git history (optional) ────────────────────────────────────
if [ "${1:-}" = "--hard" ]; then
    echo "[6/6] Removing .git for clean ZIP export..."
    rm -rf .git/ 2>/dev/null || true
    echo "⚠️  .git removed. This is a bare directory — no history, no remotes."
else
    echo "[6/6] Skipped. Use --hard to remove .git for ZIP export."
fi

echo ""
echo "=== Done. Repo is clean. ==="
echo "To create a ZIP:  cd .. && zip -r Trust-Suite.zip Trust-Suite/"
