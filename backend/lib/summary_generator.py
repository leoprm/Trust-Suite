#!/usr/bin/env python3
"""Summary generator — formatea y escribe resumen diario en obsidian/decisions/.

Input (stdin): clasificación pre-hecha
    {tree_id, research_date, objective, oportunidad: [...], riesgo: [...],
     solucion: [...], keywords: [...]}

Output (stdout): JSON {status, path, size}
Side effect: escribe obsidian/decisions/YYYY-MM-DD-summary.md vía sandbox API.
"""

import json, os, sys, urllib.request

API_URL = os.environ.get("TRUSTMAKER_API_URL", "http://localhost:3100")
API_KEY = os.environ.get("HERMES_API_SERVER_KEY", "")


def api_write(tree_id: str, path: str, content: str) -> dict:
    url = f"{API_URL}/api/trees/{tree_id}/sandbox/write"
    body = json.dumps({"path": path, "content": content}).encode()
    req = urllib.request.Request(url, data=body, method="POST",
        headers={"Authorization": f"Bearer {API_KEY}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {i}" for i in items) if items else "- (sin hallazgos relevantes)"


def main() -> None:
    data = json.load(sys.stdin)
    tid, date = data["tree_id"], data["research_date"]
    obj = data.get("objective", "")[:200].replace("\n", " ").replace('"', "'")
    kws = ", ".join(data.get("keywords", []))

    content = f"""---
type: decision
date: {date}
source: nightly-research-pipeline
keywords: [{kws}]
---

# Research Summary — {date}

## 🔵 Oportunidades
{_bullets(data.get("oportunidades", data.get("oportunidad", [])))}

## 🟡 Riesgos
{_bullets(data.get("riesgos", data.get("riesgo", [])))}

## 🟢 Soluciones
{_bullets(data.get("soluciones", data.get("solucion", [])))}
"""
    path = f"obsidian/decisions/{date}-summary.md"
    result = api_write(tid, path, content)
    print(f"  ✓ {path} ({result['size']} bytes)", file=sys.stderr)
    print(json.dumps({"status": "ok", "path": path, "size": result["size"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
