#!/usr/bin/env python3
"""Index and search images using CLIP (ViT-B-32) via sentence-transformers.

Usage:
  python3 backend/lib/clip_index.py index <treeId>
        Scan media/<treeId>/ for new images, generate embeddings, store in SQLite.

  python3 backend/lib/clip_index.py search <treeId> "<query>" [--limit N]
        Return top-N matches by cosine similarity as JSON.

Output (search):
  [{"path": "...", "senderName": "...", "date": "...", "score": 0.95}, ...]

Timeout guideline: 60s per call.

Schema (in media/<treeId>/index.db):
  CREATE TABLE IF NOT EXISTS images (
      path TEXT PRIMARY KEY,
      sender_name TEXT,
      date TEXT,
      embedding BLOB
  );
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

# ── paths ────────────────────────────────────────────────────────────────────
# Script lives at backend/lib/clip_index.py inside the project.
# MEDIA_ROOT is the project-relative media/ directory.
_SCRIPT = Path(__file__).resolve()
_PROJECT = _SCRIPT.parent.parent.parent          # TrustMaker/
MEDIA_ROOT = _PROJECT / "media"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}

DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS images (
    path TEXT PRIMARY KEY,
    sender_name TEXT,
    date TEXT,
    embedding BLOB
);
"""


# ── lazy model singleton ────────────────────────────────────────────────────

_model = None


def _get_model():
    """Return the sentence-transformers CLIP model (lazy load, cached)."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("clip-ViT-B-32", trust_remote_code=True)
    return _model


# ── helpers ──────────────────────────────────────────────────────────────────

def _db_path(tree_id: str) -> Path:
    return MEDIA_ROOT / tree_id / "index.db"


def _ensure_db(tree_id: str) -> sqlite3.Connection:
    db_path = _db_path(tree_id)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(DB_SCHEMA)
    conn.commit()
    return conn


def _is_image(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_EXTS


def _scan_images(tree_id: str) -> list[Path]:
    """Return absolute paths of all image files under media/<treeId>/."""
    media_dir = MEDIA_ROOT / tree_id
    if not media_dir.is_dir():
        return []
    return sorted(p for p in media_dir.rglob("*") if p.is_file() and _is_image(p))


def _embed_bytes(array: np.ndarray) -> bytes:
    """Serialize a float32 numpy array to raw bytes."""
    return array.astype(np.float32).tobytes()


def _bytes_to_array(blob: bytes) -> np.ndarray:
    """Reconstruct a float32 numpy array from raw bytes."""
    return np.frombuffer(blob, dtype=np.float32)


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    a_norm = a / (np.linalg.norm(a) + 1e-12)
    b_norm = b / (np.linalg.norm(b) + 1e-12)
    return float(np.dot(a_norm, b_norm))


def _infer_sender(img_path: Path) -> str:
    """Heuristic: use parent dir name if it looks like a sender subfolder."""
    # The first child of media/<treeId>/ may be a sender folder
    try:
        rel = img_path.relative_to(MEDIA_ROOT)
        parts = rel.parts
        if len(parts) >= 3:
            return parts[1]  # media/<treeId>/<sender>/...
    except ValueError:
        pass
    return ""


def _file_date(img_path: Path) -> str:
    return time.strftime(
        "%Y-%m-%dT%H:%M:%S",
        time.localtime(img_path.stat().st_mtime),
    )


# ── commands ─────────────────────────────────────────────────────────────────

def cmd_index(tree_id: str) -> None:
    """Scan media/<treeId>/ for new images and store their CLIP embeddings."""
    media_dir = MEDIA_ROOT / tree_id
    if not media_dir.is_dir():
        print(f"[clip_index] No media directory: {media_dir}", file=sys.stderr)
        return

    all_images = _scan_images(tree_id)
    if not all_images:
        print(f"[clip_index] No images found in {media_dir}", file=sys.stderr)
        return

    conn = _ensure_db(tree_id)

    existing = set(
        row[0]
        for row in conn.execute("SELECT path FROM images").fetchall()
    )

    new_images = [p for p in all_images if str(p) not in existing]
    if not new_images:
        print(
            f"[clip_index] {tree_id}: all {len(all_images)} images already indexed."
        )
        conn.close()
        return

    model = _get_model()
    print(
        f"[clip_index] {tree_id}: indexing {len(new_images)} new image(s) "
        f"(total {len(all_images)}, already indexed {len(existing)})"
    )

    start = time.time()
    indexed = 0

    for img_path in new_images:
        try:
            pil_img = Image.open(img_path).convert("RGB")
            embedding = model.encode(pil_img)
            sender_name = _infer_sender(img_path)
            date_str = _file_date(img_path)

            conn.execute(
                "INSERT OR REPLACE INTO images(path, sender_name, date, embedding) "
                "VALUES (?, ?, ?, ?)",
                (str(img_path), sender_name, date_str, _embed_bytes(embedding)),
            )
            indexed += 1
        except Exception as exc:
            print(f"  SKIP {img_path.name}: {exc}", file=sys.stderr)

    conn.commit()
    conn.close()

    elapsed = time.time() - start
    print(
        f"[clip_index] {tree_id}: indexed {indexed}/{len(new_images)} images "
        f"in {elapsed:.1f}s"
    )


def cmd_search(tree_id: str, query: str, limit: int = 5) -> None:
    """Search indexed images by text query (cosine similarity). Returns JSON."""
    db_path = _db_path(tree_id)
    if not db_path.is_file():
        print(json.dumps([]))
        return

    conn = sqlite3.connect(str(db_path))
    rows = conn.execute(
        "SELECT path, sender_name, date, embedding FROM images"
    ).fetchall()
    conn.close()

    if not rows:
        print(json.dumps([]))
        return

    model = _get_model()
    query_emb = model.encode([query])[0]

    scored: list[dict[str, Any]] = []
    for path, sender_name, date_str, emb_blob in rows:
        img_emb = _bytes_to_array(emb_blob)
        score = _cosine_sim(query_emb, img_emb)
        scored.append(
            {
                "path": path,
                "senderName": sender_name or "",
                "date": date_str or "",
                "score": round(score, 4),
            }
        )

    scored.sort(key=lambda x: x["score"], reverse=True)
    print(json.dumps(scored[:limit], ensure_ascii=False))


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="CLIP image indexer for TrustMaker"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    idx = sub.add_parser("index", help="Scan media/<treeId>/ and index new images")
    idx.add_argument("treeId", help="Tree identifier")

    srch = sub.add_parser("search", help="Search images by text query")
    srch.add_argument("treeId", help="Tree identifier")
    srch.add_argument("query", help="Natural-language search query")
    srch.add_argument(
        "--limit", type=int, default=5, help="Max results (default: 5)"
    )

    args = parser.parse_args()

    if args.command == "index":
        cmd_index(args.treeId)
    elif args.command == "search":
        cmd_search(args.treeId, args.query, args.limit)


if __name__ == "__main__":
    main()
