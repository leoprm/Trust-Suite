#!/usr/bin/env python3
"""CLI wrapper for hermes_tools.web_search — reads query from argv, outputs JSON to stdout."""
import json
import sys

from hermes_tools import web_search


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "query is required"}))
        sys.exit(1)

    query = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 5

    try:
        result = web_search(query, limit=min(limit, 20))
        # Transform to the shape expected by the API
        items = result.get("data", {}).get("web", [])
        results = [
            {
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "description": item.get("description", ""),
            }
            for item in items
        ]
        print(json.dumps(results))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
