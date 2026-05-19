#!/usr/bin/env python3
"""Web researcher — busca keywords en internet y extrae referencias para R3.

Ejecución (vía Hermes execute_code, donde hermes_tools está disponible):
    python3 lib/web_researcher.py < enriched_keywords.json > results.json

Input JSON (stdin):
    {
      "keywords": [{"word": "...", "score": 12.0, "freq": 6, "in_objective": true}, ...],
      "extra_keywords": ["file.pdf", ...],
      "objective": "tree description + objectives context",
      "tree_id": "abc123"
    }

Output JSON (stdout):
    {
      "tree_id": "abc123",
      "objective": "...",
      "research_date": "YYYY-MM-DD",
      "results": [{"keyword": "...", "score": ..., "freq": ..., "in_objective": ...,
                    "sources": [{"title": "...", "url": "...", "summary": "..."}]}],
      "extra_keywords": [...]
    }
"""

from __future__ import annotations

import json
import sys
from datetime import date

# hermes_tools is injected by the execute_code runtime
from hermes_tools import web_search, web_extract  # type: ignore[import-untyped]

MAX_SUMMARY_CHARS = 200


def _one_liner(text: str) -> str:
    """First sentence, trimmed to MAX_SUMMARY_CHARS."""
    sentence = text.split(".")[0].strip()
    if len(sentence) > MAX_SUMMARY_CHARS:
        sentence = sentence[: MAX_SUMMARY_CHARS - 1].rsplit(" ", 1)[0] + "…"
    return sentence + ("." if sentence[-1] not in ".!?…" else "")


def search_keyword(keyword: str, objective: str, top_n: int = 3) -> list[dict]:
    """Search web for keyword + objective context; return top-N sources with 1-line summaries."""
    query = f"{keyword} {objective}"[:300]  # keep query reasonable
    search_result = web_search(query, limit=top_n)
    items = search_result.get("data", {}).get("web", [])

    sources: list[dict] = []
    for item in items[:top_n]:
        url = item.get("url", "")
        title = item.get("title", "")
        summary = item.get("description", "")

        if url:
            try:
                extracted = web_extract([url])
                ext = extracted.get("results", [{}])[0]
                if ext.get("content"):
                    summary = _one_liner(ext["content"])
                elif ext.get("error"):
                    summary = item.get("description", f"[{ext['error'][:80]}]")
            except Exception:
                pass  # keep fallback summary from search snippet

        sources.append({"title": title, "url": url, "summary": summary})

    return sources


def main() -> None:
    input_data = json.load(sys.stdin)

    keywords = input_data.get("keywords", [])
    objective = input_data.get("objective", "")

    results: list[dict] = []
    for kw in keywords:
        word = kw["word"]
        sources = search_keyword(word, objective)
        results.append({
            "keyword": word,
            "score": kw.get("score", 0),
            "freq": kw.get("freq", 0),
            "in_objective": kw.get("in_objective", False),
            "sources": sources,
        })

    output = {
        "tree_id": input_data.get("tree_id", ""),
        "objective": objective,
        "research_date": date.today().isoformat(),
        "results": results,
        "extra_keywords": input_data.get("extra_keywords", []),
    }

    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
