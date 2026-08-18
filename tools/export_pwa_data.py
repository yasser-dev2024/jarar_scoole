"""Export the read-only mobile display dataset from the bundled SQLite file."""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


TABLES = (
    "app_settings",
    "schedule_entries",
    "classes",
    "teachers",
    "assignments",
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    if not args.source.is_file():
        raise SystemExit(f"SQLite source not found: {args.source}")

    version_file = args.source.with_name("data_version.txt")
    data_version = int(version_file.read_text("utf-8").strip()) if version_file.is_file() else 1

    connection = sqlite3.connect(args.source)
    connection.row_factory = sqlite3.Row
    try:
        available = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        missing = set(TABLES) - available
        if missing:
            raise SystemExit(f"Missing required tables: {sorted(missing)}")

        tables: dict[str, list[dict[str, object]]] = {}
        for table in TABLES:
            order_by = (
                "sort_order, start_time, id"
                if table == "schedule_entries"
                else "id"
            )
            rows = connection.execute(
                f'SELECT * FROM "{table}" ORDER BY {order_by}'
            )
            tables[table] = [dict(row) for row in rows]
    finally:
        connection.close()

    payload = {
        "format_version": "pwa-1",
        "app_name": "SchoolOfflineSuite",
        "data_version": data_version,
        "generated_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "tables": tables,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
