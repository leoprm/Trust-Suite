#!/usr/bin/env python3
"""Keyword extractor — extrae términos relevantes del chat del árbol.

Lee conversations/*.txt de los últimos 90 días, tokeniza, quita stopwords,
cruza con objetivo del árbol (descripción + objectives de tree_meta.json),
y devuelve top 5 keywords. Incluye archivos cercanos (±5 min) como extras.

Ejecutar desde el sandbox del árbol:
    python3 apps/keyword_extractor.py

Salida: JSON con {keywords: [...], extra_keywords: [...]}
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

# ── Spanish stopwords ──────────────────────────────────────────────────────
STOPWORDS: set[str] = set(
    "a al algo algunas algunos ante antes aquel aquella aquellos como con "
    "contra cual cuando de del desde durante e el ella ellas ello ellos en "
    "entre era eramos eran eras es esa esas ese eso esos esta estaba estado "
    "estas este esto estos está estuvo etc fin fue fueron fui fuimos ha hace "
    "han has hasta hay la las le les lo los me mi mis mucho muchos muy más "
    "mía mío ni no nos nosotras nosotros otra otras otro otros para pero "
    "por porque que qué se sea sean ser sido sin sobre su sus tan tanto te "
    "tendrá tenéis tengo tener todos tu tus tú un una uno unos usted va van "
    "vosotras vosotros y yo ya él".split()
)


def tokenize(text: str) -> list[str]:
    """Lowercase tokens ≥ 3 chars, stripping punctuation."""
    return re.findall(r"[a-záéíóúñü]{3,}", text.lower())


def freq_words(text: str, top_n: int = 30) -> list[tuple[str, int]]:
    """Tokenize, drop stopwords, return top-N by frequency."""
    tokens = [t for t in tokenize(text) if t not in STOPWORDS]
    return Counter(tokens).most_common(top_n)


def score_against_tree(
    freq: list[tuple[str, int]], tree_text: str
) -> list[tuple[str, float, int, bool]]:
    """Score: freq × 2.0 if word appears in tree objectives, else × 1.0."""
    tree_tokens = set(tokenize(tree_text))
    scored: list[tuple[str, float, int, bool]] = []
    for word, count in freq:
        in_obj = word in tree_tokens
        bonus = 2.0 if in_obj else 1.0
        scored.append((word, count * bonus, count, in_obj))
    scored.sort(key=lambda x: (-x[1], -x[2]))
    return scored


def recent_conversations(conv_dir: Path, days: int = 90) -> list[Path]:
    """Return daily .txt files modified within `days`."""
    cutoff = datetime.now() - timedelta(days=days)
    files: list[Path] = []
    if not conv_dir.is_dir():
        return files
    for p in sorted(conv_dir.glob("????-??-??.txt")):
        try:
            if datetime.fromtimestamp(p.stat().st_mtime) >= cutoff:
                files.append(p)
        except OSError:
            continue
    return files


def nearby_files(conv_dir: Path, window_minutes: int = 5) -> set[str]:
    """Filenames (non-txt) modified within ±window_minutes of any conversation file."""
    recent = recent_conversations(conv_dir)
    if not recent:
        return set()
    timestamps = [p.stat().st_mtime for p in recent]
    window = window_minutes * 60
    nearby: set[str] = set()
    for entry in conv_dir.iterdir():
        if not entry.is_file():
            continue
        if entry.suffix == ".txt":
            continue
        mt = entry.stat().st_mtime
        for ts in timestamps:
            if abs(mt - ts) <= window:
                nearby.add(entry.name)
                break
    return nearby


def main() -> None:
    workdir = Path.cwd()
    conv_dir = workdir / "conversations"
    meta_path = workdir / "context" / "tree_meta.json"

    # ── Tree objectives ───────────────────────────────────────────────────
    tree_text = ""
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        tree_text = " ".join(
            v for v in (meta.get("description"), meta.get("objectives")) if v
        )

    # ── Read conversations ────────────────────────────────────────────────
    all_text = ""
    for fp in recent_conversations(conv_dir):
        try:
            text = fp.read_text(encoding="utf-8")
            # Strip sender prefixes: "[Name]: message" → message
            text = re.sub(r"^\[?[^\]\n:]+?\]?:\s*", "", text, flags=re.MULTILINE)
            all_text += text + "\n"
        except Exception:
            continue

    # ── Extract & score keywords ──────────────────────────────────────────
    freq = freq_words(all_text)
    scored = score_against_tree(freq, tree_text)

    # ── Output ────────────────────────────────────────────────────────────
    extra = sorted(nearby_files(conv_dir))
    result = {
        "keywords": [
            {"word": w, "score": round(s, 1), "freq": f, "in_objective": io}
            for w, s, f, io in scored[:5]
        ],
        "extra_keywords": extra,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
