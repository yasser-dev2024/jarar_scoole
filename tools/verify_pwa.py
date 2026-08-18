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
    assert data.get("data_version", 0) >= 6
    assert len(data["tables"]["assignments"]) == 462
    assert len({row["class_id"] for row in data["tables"]["assignments"]}) == 14
    assert {row["day_of_week"] for row in data["tables"]["assignments"]} == set(range(5))
    entries = sorted(data["tables"]["schedule_entries"], key=lambda row: row["sort_order"])
    lessons = [row for row in entries if row["entry_type"] == "lesson"]
    assert len(lessons) == 7
    assert lessons[0]["start_time"] == "07:00:00"
    assert lessons[0]["end_time"] == "07:45:00"
    assert lessons[1]["title"] == "الحصة الثانية"
    assert lessons[1]["start_time"] == "07:45:18"
    assert lessons[1]["end_time"] == "08:30:18"
    assert lessons[2]["title"] == "الحصة الثالثة"

    service_worker = (IPHONE / "sw.js").read_text("utf-8")
    application = (IPHONE / "app.js").read_text("utf-8")
    styles = (IPHONE / "styles.css").read_text("utf-8")
    assert "const BUNDLED_DATA_VERSION = 6;" in application
    assert "const SCHOOL_TIME_ZONE = 'Asia/Riyadh';" in application
    assert "timeZone: SCHOOL_TIME_ZONE" in application
    assert "localStorage.removeItem('school-pwa-local-start')" in application
    assert "time-button" not in (IPHONE / "index.html").read_text("utf-8")
    assert "assignment-table-row" in styles
    for color in ("#eff6ff", "#f0fdf4", "#faf5ff", "#fff7ed", "#fef2f2", "#f0f9ff"):
        assert color in styles
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
