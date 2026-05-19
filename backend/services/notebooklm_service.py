#!/usr/bin/env python3
"""
NotebookLM Service — JSON-lines bridge for TrustMaker backend.

Reads JSON requests from stdin, writes JSON responses to stdout.
One request per line. All responses are single-line JSON.

Protocol:
  → {"method": "...", "params": {...}, "id": "optional-request-id"}
  ← {"ok": true, "data": {...}, "id": "optional-request-id"}
  ← {"ok": false, "error": "...", "id": "optional-request-id"}

Methods:
  create_notebook(treeId)  → {notebookId, name}
  delete_notebook(treeId)  → {deleted: true}
  ask(treeId, question)    → {answer, citations: [...]}
  add_source(treeId, input) → {sourceId, title, kind}
  generate_podcast(treeId) → {taskId}
  list_sources(treeId)     → {sources: [...]}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from typing import Any

# Suppress noisy notebooklm-py debug/info logs on stderr
logging.basicConfig(
    level=logging.WARNING,
    format="%(levelname)s:%(name)s:%(message)s",
    stream=sys.stderr,
)
# notebooklm-py internal loggers
for _name in (
    "notebooklm",
    "notebooklm._core",
    "notebooklm._chat",
    "notebooklm._notebooks",
    "notebooklm._sources",
    "notebooklm._artifacts",
    "notebooklm._logging",
    "notebooklm.auth",
    "notebooklm.rpc",
    "httpx",
    "httpcore",
):
    logging.getLogger(_name).setLevel(logging.WARNING)


# ── Client singleton ───────────────────────────────────────────────────────
_client: Any = None  # NotebookLMClient | None
_client_lock = asyncio.Lock()


async def get_client():
    """Lazy-init the NotebookLM client (from stored Playwright auth)."""
    global _client
    if _client is not None and _client.is_connected:
        return _client

    async with _client_lock:
        if _client is not None and _client.is_connected:
            return _client

        from notebooklm import NotebookLMClient

        # Try explicit profile from env, fall back to default storage
        profile = os.environ.get("NOTEBOOKLM_PROFILE")
        storage_path = os.environ.get("NOTEBOOKLM_STORAGE_PATH")

        if storage_path:
            _client = await NotebookLMClient.from_storage(
                path=storage_path, keepalive=600
            )
        else:
            _client = await NotebookLMClient.from_storage(
                profile=profile, keepalive=600
            )

        await _client.__aenter__()
        return _client


async def shutdown_client():
    """Gracefully close the client."""
    global _client
    if _client is not None:
        try:
            await _client.__aexit__(None, None, None)
        except Exception:
            pass
        _client = None


# ── Helpers ─────────────────────────────────────────────────────────────────

def notebook_name(tree_id: str) -> str:
    """Convention: every tree gets notebook named tm-{treeId}."""
    return f"tm-{tree_id}"


async def find_notebook_by_name(client, tree_id: str):
    """Find a notebook by its tree-id name. Returns Notebook or None."""
    name = notebook_name(tree_id)
    notebooks = await client.notebooks.list()
    for nb in notebooks:
        if nb.title == name:
            return nb
    return None


# ── Method handlers ─────────────────────────────────────────────────────────

async def handle_create_notebook(params: dict) -> dict:
    tree_id = params["treeId"]
    client = await get_client()

    existing = await find_notebook_by_name(client, tree_id)
    if existing:
        return {"notebookId": existing.id, "name": existing.title, "existed": True}

    from notebooklm import Notebook
    nb: Notebook = await client.notebooks.create(notebook_name(tree_id))
    return {"notebookId": nb.id, "name": nb.title, "existed": False}


async def handle_delete_notebook(params: dict) -> dict:
    tree_id = params["treeId"]
    client = await get_client()

    existing = await find_notebook_by_name(client, tree_id)
    if not existing:
        return {"deleted": False, "reason": "not_found"}

    await client.notebooks.delete(existing.id)
    return {"deleted": True, "notebookId": existing.id}


async def handle_ask(params: dict) -> dict:
    tree_id = params["treeId"]
    question = params["question"]
    client = await get_client()

    nb = await find_notebook_by_name(client, tree_id)
    if not nb:
        return {"error": f"No notebook found for tree {tree_id}"}

    result = await client.chat.ask(nb.id, question)

    citations = []
    for ref in result.references:
        citations.append({
            "sourceId": ref.source_id,
            "number": ref.citation_number,
            "text": ref.cited_text,
        })

    return {
        "answer": result.answer,
        "conversationId": result.conversation_id,
        "turnNumber": result.turn_number,
        "citations": citations,
    }


async def handle_add_source(params: dict) -> dict:
    """Add a source to the tree notebook.

    Detects input type:
      - URL (starts with http:// or https://) → add_url
      - Existing file path → add_file
      - Otherwise → add_text
    """
    tree_id = params["treeId"]
    input_val = params["input"]
    title = params.get("title", "note")
    client = await get_client()

    nb = await find_notebook_by_name(client, tree_id)
    if not nb:
        return {"error": f"No notebook found for tree {tree_id}"}

    # Determine source kind
    if isinstance(input_val, str):
        if input_val.startswith(("http://", "https://")):
            source = await client.sources.add_url(nb.id, input_val)
            return {
                "sourceId": source.id,
                "title": source.title,
                "kind": "url",
                "url": input_val,
            }
        elif os.path.isfile(input_val):
            source = await client.sources.add_file(nb.id, input_val)
            return {
                "sourceId": source.id,
                "title": source.title,
                "kind": "file",
                "filePath": input_val,
            }

    # Fallback: add as text
    text_title = title or "note"
    text_content = str(input_val)
    source = await client.sources.add_text(nb.id, text_title, text_content)
    return {
        "sourceId": source.id,
        "title": source.title,
        "kind": "text",
    }


async def handle_generate_podcast(params: dict) -> dict:
    tree_id = params["treeId"]
    client = await get_client()

    nb = await find_notebook_by_name(client, tree_id)
    if not nb:
        return {"error": f"No notebook found for tree {tree_id}"}

    status = await client.artifacts.generate_audio(nb.id)
    return {
        "taskId": status.task_id,
        "status": status.status,
    }


async def handle_list_sources(params: dict) -> dict:
    tree_id = params["treeId"]
    client = await get_client()

    nb = await find_notebook_by_name(client, tree_id)
    if not nb:
        return {"error": f"No notebook found for tree {tree_id}"}

    sources = await client.sources.list(nb.id)
    result = []
    for src in sources:
        result.append({
            "sourceId": src.id,
            "title": src.title,
            "kind": src.kind if hasattr(src, "kind") else src.type_code,
            "url": getattr(src, "url", None),
            "status": str(src.status) if hasattr(src, "status") else "unknown",
        })
    return {"sources": result, "count": len(result)}


# ── Dispatch table ──────────────────────────────────────────────────────────

DISPATCH = {
    "create_notebook": handle_create_notebook,
    "delete_notebook": handle_delete_notebook,
    "ask": handle_ask,
    "add_source": handle_add_source,
    "generate_podcast": handle_generate_podcast,
    "list_sources": handle_list_sources,
}


# ── Main loop ───────────────────────────────────────────────────────────────

def send_response(ok: bool, data: Any = None, error: str = "", req_id: str = "") -> None:
    """Write a single-line JSON response to stdout."""
    resp: dict[str, Any] = {"ok": ok}
    if ok:
        resp["data"] = data
    else:
        resp["error"] = error
    if req_id:
        resp["id"] = req_id
    sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
    sys.stdout.flush()


async def process_line(line: str) -> None:
    """Parse and dispatch a single JSON request."""
    line = line.strip()
    if not line:
        return

    try:
        msg = json.loads(line)
    except json.JSONDecodeError as e:
        send_response(False, error=f"Invalid JSON: {e}")
        return

    method = msg.get("method", "")
    params = msg.get("params", {})
    req_id = msg.get("id", "")

    if method == "shutdown":
        await shutdown_client()
        send_response(True, data={"shutdown": True}, req_id=req_id)
        return

    handler = DISPATCH.get(method)
    if not handler:
        send_response(
            False,
            error=f"Unknown method: {method}. Available: {list(DISPATCH.keys())}",
            req_id=req_id,
        )
        return

    try:
        data = await handler(params)
        send_response(True, data=data, req_id=req_id)
    except Exception as e:
        # Log the traceback to stderr for debugging
        import traceback
        traceback.print_exc(file=sys.stderr)
        send_response(False, error=f"{type(e).__name__}: {e}", req_id=req_id)


async def main_loop() -> None:
    """Read JSON lines from stdin, write responses to stdout."""
    # Signal readiness
    send_response(True, data={"ready": True, "version": "0.1.0"})

    loop = asyncio.get_event_loop()

    # Read stdin line by line (async-compatible via executor)
    while True:
        try:
            line = await loop.run_in_executor(None, sys.stdin.readline)
        except KeyboardInterrupt:
            break

        if not line:  # EOF
            break

        await process_line(line)

    await shutdown_client()


if __name__ == "__main__":
    asyncio.run(main_loop())
