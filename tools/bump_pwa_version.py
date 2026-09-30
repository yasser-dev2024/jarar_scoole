"""Update every published PWA version marker with one release command."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
IPHONE = ROOT / "iphone"
VERSION_PATTERN = re.compile(r"^\d+(?:\.\d+){1,3}$")


def replace_once(path: Path, pattern: str, replacement: str) -> None:
    source = path.read_text("utf-8")
    updated, count = re.subn(pattern, replacement, source, count=1)
    if count != 1:
        raise RuntimeError(f"Could not update the version marker in {path}")
    path.write_text(updated, "utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bump the static PWA release version.")
    parser.add_argument("version", help="Dotted numeric version such as 1.5.2")
    args = parser.parse_args()
    if not VERSION_PATTERN.fullmatch(args.version):
        parser.error("version must contain 2 to 4 numeric parts, for example 1.5.2")

    replace_once(
        IPHONE / "app.js",
        r"const APP_VERSION = '[^']+';",
        f"const APP_VERSION = '{args.version}';",
    )
    replace_once(
        IPHONE / "sw.js",
        r"const APP_VERSION = '[^']+';",
        f"const APP_VERSION = '{args.version}';",
    )
    replace_once(
        IPHONE / "index.html",
        r"الإصدار [0-9.]+ PWA",
        f"الإصدار {args.version} PWA",
    )

    version_file = IPHONE / "version.json"
    version_file.write_text(
        json.dumps(
            {
                "version": args.version,
                "released_at": datetime.now(ZoneInfo("Asia/Riyadh")).isoformat(timespec="seconds"),
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        "utf-8",
    )
    print(f"PWA version updated to {args.version}")


if __name__ == "__main__":
    main()
