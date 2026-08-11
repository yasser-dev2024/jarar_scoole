"""Static verification for the installable iPhone PWA."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IPHONE = ROOT / "iphone"


def main() -> None:
    manifest = json.loads((IPHONE / "manifest.webmanifest").read_text("utf-8"))
    assert manifest["display"] == "standalone"
    assert manifest["start_url"].startswith("./")
    assert manifest["scope"] == "./"
    assert any(icon["sizes"] == "192x192" for icon in manifest["icons"])

    data = json.loads((IPHONE / "data" / "default-data.json").read_text("utf-8"))
    required = {
        "app_settings",
        "schedule_entries",
        "classes",
        "teachers",
        "assignments",
    }
    assert required <= data["tables"].keys()
    assert data["tables"]["app_settings"]
    assert data["tables"]["schedule_entries"]

    service_worker = (IPHONE / "sw.js").read_text("utf-8")
    cached_paths = re.findall(r"'\./([^']*)'", service_worker)
    missing = [path for path in cached_paths if path and not (IPHONE / path).is_file()]
    assert not missing, f"Missing cached files: {missing}"

    landing_page = (ROOT / "index.html").read_text("utf-8")
    assert 'href="./iphone/"' in landing_page
    assert "Android وiPhone متاحان الآن" in landing_page
    forbidden = ("ينتظر توقيع", "TestFlight", "غير الموقّع", "Apple Developer")
    assert not any(text in landing_page for text in forbidden)

    print(
        "PWA verified: "
        f"{len(data['tables']['schedule_entries'])} schedule entries, "
        f"{len(data['tables']['assignments'])} assignments, "
        f"{len(cached_paths)} cached resources"
    )


if __name__ == "__main__":
    main()
