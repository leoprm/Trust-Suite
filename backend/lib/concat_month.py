#!/usr/bin/env python3
"""Concatenate daily conversation files into a monthly archive.

Usage:
    python lib/concat_month.py <treeId> <YYYY-MM>

Reads all files matching conversations/<treeId>/<YYYY-MM>-*.txt,
sorts them chronologically, and concatenates into
conversations/<treeId>/monthly/<YYYY-MM>.txt.

Outputs a JSON summary to stdout.  Errors go to stderr.
Exit code 0 on success, 1 on failure.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


def _resolve_root() -> Path:
    """Resolve the backend project root (parent of this script's lib/ dir)."""
    return Path(__file__).resolve().parent.parent


def _extract_users(content: str) -> list[str]:
    """Heuristic: grab 'DisplayName:' or 'Name:' prefixes from each line.

    Falls back to ['unknown'] if nothing is found.
    """
    pattern = re.compile(r"^(?:\[)?([A-Za-zÀ-ÿ0-9_\s.-]{2,40}?)(?:\])?:\s", re.MULTILINE)
    users = set()
    for m in pattern.finditer(content):
        name = m.group(1).strip()
        if name and not name.isdigit():
            users.add(name)
    return sorted(users) if users else ["unknown"]


SANDBOX_BASE = os.environ.get("SANDBOX_BASE_DIR", "/home/trustmaker/trees")


def concat_month(tree_id: str, year_month: str) -> dict[str, Any]:
    conv_dir = Path(SANDBOX_BASE) / tree_id / "conversations"

    # -- Validate tree directory -------------------------------------------
    if not conv_dir.is_dir():
        print(f"Error: treeId '{tree_id}' does not exist ({conv_dir})", file=sys.stderr)
        sys.exit(1)

    # -- Collect daily files -----------------------------------------------
    pattern = f"{year_month}-*.txt"
    daily_files = sorted(
        conv_dir.glob(pattern),
        key=lambda p: p.name,  # lexicographic sort works for YYYY-MM-DD
    )

    if not daily_files:
        print(
            f"Error: no daily files found for {year_month} in {conv_dir}",
            file=sys.stderr,
        )
        sys.exit(1)

    # -- Concatenate -------------------------------------------------------
    parts: list[str] = []
    for fp in daily_files:
        parts.append(fp.read_text(encoding="utf-8"))

    combined = "\n".join(parts)

    # -- Stats -------------------------------------------------------------
    total_messages = len([l for l in combined.splitlines() if l.strip()])
    total_chars = len(combined)
    unique_users = _extract_users(combined)
    days_with_activity = len(daily_files)

    # -- Write output ------------------------------------------------------
    monthly_dir = conv_dir / "monthly"
    monthly_dir.mkdir(parents=True, exist_ok=True)
    out_path = monthly_dir / f"{year_month}.txt"
    out_path.write_text(combined, encoding="utf-8")

    return {
        "path": str(out_path),
        "total_messages": total_messages,
        "total_chars": total_chars,
        "unique_users": unique_users,
        "days_with_activity": days_with_activity,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Concatenate daily conversation files into a monthly archive."
    )
    parser.add_argument(
        "tree_id",
        metavar="TREE_ID",
        help="UUID of the tree (e.g. 9170d631-dfa1-4123-a545-17c5881fd261)",
    )
    parser.add_argument(
        "year_month",
        metavar="YYYY-MM",
        help="Year and month to concatenate (e.g. 2026-05)",
    )
    args = parser.parse_args()

    # Basic format validation
    if not re.match(r"^\d{4}-\d{2}$", args.year_month):
        print(f"Error: YYYY-MM must match pattern YYYY-MM (got '{args.year_month}')", file=sys.stderr)
        sys.exit(1)

    result = concat_month(args.tree_id, args.year_month)
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
