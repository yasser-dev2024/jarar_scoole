"""Static verification for the installable iPhone PWA."""

from __future__ import annotations

import hashlib
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
        "waiting_allocations",
    }
    assert required <= data["tables"].keys()
    assert data["tables"]["app_settings"]
    assert data["tables"]["schedule_entries"]
    assert data.get("data_version", 0) >= 9
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
    classes = {row["id"]: row["class_name"] for row in data["tables"]["classes"]}
    teachers = {row["id"]: row["teacher_name"] for row in data["tables"]["teachers"]}
    period_by_entry = {row["id"]: index + 1 for index, row in enumerate(lessons)}
    assignments = {
        (
            classes[row["class_id"]],
            row["day_of_week"],
            period_by_entry[row["schedule_entry_id"]],
        ): (row["subject_name"], teachers[row["teacher_id"]])
        for row in data["tables"]["assignments"]
    }
    assert assignments[("1/4", 0, 2)] == ("علوم", "أحمد الخيري")
    assert assignments[("1/4", 0, 3)] == ("القران والدراسات", "عبدالرحمن ال حموض")
    assert assignments[("4/4", 3, 5)] == ("رياضيات", "بريق القرني")
    assert assignments[("4/5", 4, 4)] == ("رياضيات", "حسين الزيداني")
    assert assignments[("5/5", 2, 3)] == ("نشاط", "بكري عسيري")
    assert not any(
        teachers[row["teacher_id"]] == "عبدالكريم القحطاني"
        for row in data["tables"]["assignments"]
    )
    waiting = data["tables"]["waiting_allocations"]
    assert len(waiting) == 31
    assert [sum(int(row[key]) for row in waiting) for key in (
        "waiting_1", "waiting_2", "waiting_3", "reserve_count"
    )] == [33, 33, 33, 99]
    waiting_by_order = {int(row["display_order"]): row for row in waiting}
    assert waiting_by_order[1]["teacher_name"] == "علي الفيفي"
    assert waiting_by_order[1]["waiting_1"] == 2
    assert waiting_by_order[8]["reserve_count"] == 0
    assert waiting_by_order[24]["teacher_name"] == "بكري عسيري"
    assert waiting_by_order[31]["waiting_3"] == 1

    service_worker = (IPHONE / "sw.js").read_text("utf-8")
    application = (IPHONE / "app.js").read_text("utf-8")
    styles = (IPHONE / "styles.css").read_text("utf-8")
    assert "const APP_VERSION = '1.5.0';" in application
    assert "const BUNDLED_DATA_VERSION = 9;" in application
    assert "const SCHOOL_TIME_ZONE = 'Asia/Riyadh';" in application
    assert "const MINIMUM_BELL_GAP_MS = 2000;" in application
    assert "timeZone: SCHOOL_TIME_ZONE" in application
    assert "localStorage.removeItem('school-pwa-local-start')" in application
    assert "time-button" not in (IPHONE / "index.html").read_text("utf-8")
    assert "assignment-table-row" in styles
    assert "bell_${eventType}_enabled" in application
    assert "bell_${eventType}_sound" in application
    assert "bellAudioChain" in application
    assert "const IS_IOS = /iPad|iPhone|iPod/" in application
    assert "runtime.bellAudio || (runtime.bellAudio = new Audio())" in application
    assert "audio.pause();" in application
    assert "showWaitingDistribution" in application
    assert "waiting_allocations" in application
    assert 'id="waiting-button"' in (IPHONE / "index.html").read_text("utf-8")
    assert "waiting-fab" in styles
    assert "school-smart-pwa-v1.5.0-schedule-9-waiting-ios-bell" in service_worker
    expected_sounds = {
        *(f"period_{number}_{event}.mp3" for number in range(1, 8) for event in ("start", "end")),
        "break_start.mp3",
        "break_end.mp3",
        "break_end_start_period_4.mp3",
    }
    for sound in expected_sounds:
        assert (IPHONE / "sounds" / sound).stat().st_size > 100_000
        assert f"'./sounds/{sound}'" in service_worker
    for color in ("#eff6ff", "#f0fdf4", "#faf5ff", "#fff7ed", "#fef2f2", "#f0f9ff"):
        assert color in styles
    cached_paths = re.findall(r"'\./([^']*)'", service_worker)
    missing = [path for path in cached_paths if path and not (IPHONE / path).is_file()]
    assert not missing, f"Missing cached files: {missing}"

    landing_page = (ROOT / "index.html").read_text("utf-8")
    assert 'href="./iphone/"' in landing_page
    assert "Android وiPhone متاحان الآن" in landing_page
    assert "1.5.0 (10)" in landing_page
    apk = ROOT / "downloads" / "SchoolApp.apk"
    apk_digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    checksum = (ROOT / "downloads" / "SchoolApp.apk.sha256").read_text("utf-8")
    assert checksum.split()[0] == apk_digest
    assert apk_digest in landing_page
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
