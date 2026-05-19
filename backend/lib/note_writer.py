#!/usr/bin/env python3
"""Note writer — escribe notas de investigación en obsidian/research/ vía sandbox API.

Input (stdin): R2 web_researcher JSON output
    {tree_id, objective, research_date, results: [{keyword, score, freq, sources}], extra_keywords}

Env: TRUSTMAKER_API_URL (default http://localhost:3100), HERMES_API_SERVER_KEY

For each keyword → POST /api/trees/:treeId/sandbox/write → obsidian/research/YYYY-MM-DD-<term>.md
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request

API_URL = os.environ.get("TRUSTMAKER_API_URL", "http://localhost:3100")
API_KEY = os.environ.get("HERMES_API_SERVER_KEY", "")


def api_write(tree_id: str, path: str, content: str) -> dict:
    """POST /api/trees/:id/sandbox/write — sandbox file write."""
    url = f"{API_URL}/api/trees/{tree_id}/sandbox/write"
    body = json.dumps({"path": path, "content": content}).encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def slug(term: str) -> str:
    """Safe filename from keyword."""
    return term.lower().replace(" ", "-").replace("/", "-")[:64]


def build_note(kw: dict, research_date: str, objective: str,
               extra_files: list[str]) -> str:
    """Generate obsidian-flavored markdown with YAML frontmatter."""
    sources_md = "\n".join(
        f"- [{s['title']}]({s['url']}) — {s.get('summary', '')}"
        for s in kw.get("sources", []) if s.get("url")
    ) or "- (no se encontraron referencias web)"

    nearby_md = "\n".join(
        f"- `{f}`" for f in extra_files
    ) if extra_files else "- (ninguno)"

    safe_obj = objective[:200].replace("\n", " ").replace('"', "'")

    return f"""---
type: research
date: {research_date}
term: "{kw['keyword']}"
frequency: {kw.get('freq', 0)}
score: {kw.get('score', 0)}
objective: "{safe_obj}"
source: nightly-research-pipeline
---

# {kw['keyword']}

## Referencias Web
{sources_md}

## Archivos Cercanos
{nearby_md}

## Relacionado
<!-- [[wikilinks]] a notas relacionadas — conectar manualmente -->
"""


def main() -> None:
    data = json.load(sys.stdin)

    tree_id = data["tree_id"]
    research_date = data["research_date"]
    objective = data.get("objective", "")
    extra = data.get("extra_keywords", [])

    count = 0
    for r in data.get("results", []):
        note_path = f"obsidian/research/{research_date}-{slug(r['keyword'])}.md"
        content = build_note(r, research_date, objective, extra)
        result = api_write(tree_id, note_path, content)
        print(f"  ✓ {note_path} ({result['size']} bytes)", file=sys.stderr)
        count += 1

    print(json.dumps({"status": "ok", "notes_written": count},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
