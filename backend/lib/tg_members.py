#!/usr/bin/env python3
"""List all human participants of a Telegram group via Telethon (MTProto).

Reads a JSON object from stdin:
    {"api_id": <int>, "api_hash": "<str>", "chat_id": <int>}

Writes a JSON array to stdout:
    [{"id": <int>, "username": "<str>", "first_name": "<str>", "is_bot": <bool>}, …]

Errors and diagnostics go to stderr.  Exit code 0 on success, 1 on failure.
"""

from __future__ import annotations

import asyncio
import json
import sys
from typing import Any

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import FloodWaitError


async def _collect_participants(
    api_id: int, api_hash: str, chat_id: int, bot_token: str
) -> list[dict[str, Any]]:
    """Connect, iterate participants, return serialisable list."""

    client = TelegramClient(StringSession(), api_id, api_hash)
    participants: list[dict[str, Any]] = []

    try:
        await client.start(bot_token=bot_token)

        async for user in client.iter_participants(chat_id):
            if user.bot:
                continue
            participants.append(
                {
                    "id": user.id,
                    "username": user.username or "",
                    "first_name": getattr(user, "first_name", "") or "",
                    "is_bot": False,
                }
            )

        return participants

    except FloodWaitError as e:
        print(
            f"FloodWaitError: wait {e.seconds} seconds",
            file=sys.stderr,
        )
        sys.exit(1)

    finally:
        try:
            client.disconnect()
        except Exception:
            pass


def run(api_id: int, api_hash: str, chat_id: int, bot_token: str) -> list[dict[str, Any]]:
    """Synchronous entry-point — runs the async collector."""
    return asyncio.run(_collect_participants(api_id, api_hash, chat_id, bot_token))


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

    if not api_id or not api_hash or not chat_id or not bot_token:
        print(
            "ERROR: missing required fields: api_id, api_hash, chat_id, bot_token",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        participants = run(int(api_id), api_hash, int(chat_id), bot_token)
    except Exception:
        import traceback

        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

    json.dump(participants, sys.stdout, ensure_ascii=False)
    sys.stdout.flush()


if __name__ == "__main__":
    main()
