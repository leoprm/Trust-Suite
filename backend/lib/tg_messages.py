#!/usr/bin/env python3
"""Fetch the last N messages of a Telegram group via Telethon (MTProto).

Reads a JSON object from stdin:
    {"api_id": <int>, "api_hash": "<str>", "chat_id": <int>, "bot_token": "<str>", "count": <int>}

Writes a JSON array to stdout:
    [{"displayName": "<first_name>", "text": "<message text>"}, …]

Messages without text (photos, stickers, etc.) are skipped.
Messages from deleted accounts get displayName "Unknown".
Errors go to stderr.  Exit code 0 on success, 1 on failure.
"""

from __future__ import annotations

import asyncio
import json
import sys
from typing import Any

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import FloodWaitError


async def _collect_messages(
    api_id: int, api_hash: str, chat_id: int, bot_token: str, count: int
) -> list[dict[str, Any]]:
    client = TelegramClient(StringSession(), api_id, api_hash)
    messages: list[dict[str, Any]] = []

    try:
        await client.start(bot_token=bot_token)

        async for msg in client.iter_messages(chat_id, limit=count):
            if not msg.text:
                continue  # skip media-only, stickers, etc.

            # Resolve sender first name
            sender = await msg.get_sender()
            if sender and getattr(sender, "first_name", None):
                display_name = sender.first_name
            else:
                display_name = "Unknown"

            messages.append({
                "displayName": display_name,
                "text": msg.text,
            })

        # iter_messages returns newest-first; reverse to chronological
        messages.reverse()
        return messages

    except FloodWaitError as e:
        print(f"FloodWaitError: wait {e.seconds} seconds", file=sys.stderr)
        sys.exit(1)

    finally:
        try:
            client.disconnect()
        except Exception:
            pass


def run(api_id: int, api_hash: str, chat_id: int, bot_token: str, count: int) -> list[dict[str, Any]]:
    """Synchronous entry-point."""
    return asyncio.run(_collect_messages(api_id, api_hash, chat_id, bot_token, count))


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        print("ERROR: no input on stdin", file=sys.stderr)
        sys.exit(1)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"ERROR: invalid JSON on stdin: {e}", file=sys.stderr)
        sys.exit(1)

    api_id = payload.get("api_id")
    api_hash = payload.get("api_hash")
    chat_id = payload.get("chat_id")
    bot_token = payload.get("bot_token")
    count = payload.get("count")

    if not api_id or not api_hash or not chat_id or not bot_token or not count:
        print(
            "ERROR: missing required fields: api_id, api_hash, chat_id, bot_token, count",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        messages = run(int(api_id), api_hash, int(chat_id), bot_token, int(count))
    except Exception:
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    json.dump(messages, sys.stdout, ensure_ascii=False)
    sys.stdout.flush()


if __name__ == "__main__":
    main()
