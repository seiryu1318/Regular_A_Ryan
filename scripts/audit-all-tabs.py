from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
APP_PATH = ROOT / "app" / "page.tsx"
REPORT_PATH = ROOT / "audit" / "all-tabs-summary.json"


def issue(issues: list[dict], tab: str, code: str, detail: str) -> None:
    issues.append({"tab": tab, "code": code, "detail": detail})


def regular_change_ids(source: str) -> set[int]:
    match = re.search(r"const REGULAR_CHANGE_IDS = new Set\(\[(.*?)\]\);", source, re.S)
    if not match:
        return set()
    return {int(value) for value in re.findall(r"\d+", match.group(1))}


def score_aliases(source: str) -> dict[str, str]:
    match = re.search(r"const SCORE_PROFILE_ALIASES:.*?= \{(.*?)\};", source, re.S)
    if not match:
        return {}
    return dict(re.findall(r"'([^']+)'\s*:\s*'([^']+)'", match.group(1)))


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    app_source = APP_PATH.read_text(encoding="utf-8")
    issues: list[dict] = []

    # 정시 분석 탭: 기준 시트 동기화 행이 있으면 그 행 전체를 검사한다.
    reference_changes = [row for row in data.get("changes", []) if "docs.google.com/spreadsheets" in str(row.get("sourceFile", ""))]
    change_ids = {int(row["id"]) for row in reference_changes} or regular_change_ids(app_source)
    change_by_id = {row.get("id"): row for row in data.get("changes", [])}
    if not change_ids:
        issue(issues, "정시 변화", "visible-id-parser", "화면 노출 ID 목록을 읽지 못함")
    for change_id in sorted(change_ids):
        row = change_by_id.get(change_id)
        if row is None:
            issue(issues, "정시 변화", "missing-row", f"ID {change_id}")
            continue
        required_fields = ("u", "category", "current", "sourceFile") if reference_changes else ("u", "category", "current", "previous", "sourceFile")
        for field in required_fields:
            if not str(row.get(field, "")).strip():
                issue(issues, "정시 변화", "blank-field", f"ID {change_id} {field}")
    if "regularAdmissionChanges(data?.changes" not in app_source:
        issue(issues, "정시 변화", "render-filter", "정시 전용 필터 연결을 확인할 수 없음")

    # 반영방법 탭: 기준 시트의 대학별 분리 행과 필수 표기를 검사한다.
    profiles = data.get("profiles", [])
    profile_names = [str(row.get("u", "")).strip() for row in profiles]
    reference_labels = [
        str(reference.get("label", "")).strip()
        for row in profiles
        for reference in row.get("reference2027Rows", [])
    ]
    duplicates = sorted({name for name in reference_labels if name and reference_labels.count(name) > 1})
    for name in duplicates:
        issue(issues, "반영방법", "duplicate-reference-row", name)
    for row in profiles:
        name = str(row.get("u", "")).strip() or f"ID {row.get('id')}"
        reference_rows = row.get("reference2027Rows", [])
        required_fields = ("u", "r", "sourceFile") if reference_rows else ("u", "r", "selection", "metric", "officialSourceFile")
        for field in required_fields:
            if not str(row.get(field, "")).strip():
                issue(issues, "반영방법", "blank-field", f"{name} {field}")
        source_path = row.get("officialSourcePath")
        if source_path and not Path(source_path).is_file():
            issue(issues, "반영방법", "missing-official-file", f"{name}: {source_path}")
        pages = row.get("officialSourcePages")
        if pages is not None and (not isinstance(pages, list) or any(not isinstance(page, int) or page < 1 for page in pages)):
            issue(issues, "반영방법", "invalid-source-pages", name)
        no_regular_selection = any(token in str(row.get("selection", "")) for token in ("정시 미선발", "모집인원 없음"))
        no_exam_metric = bool(reference_rows) and all(
            not any(str(reference.get(field, "")).strip() for field in ("korean", "math", "english", "inquiry2", "inquiry1"))
            for reference in reference_rows
        )
        if (not isinstance(row.get("metrics"), list) or not row.get("metrics")) and not no_regular_selection and not no_exam_metric:
            issue(issues, "반영방법", "missing-metric", name)

    # 3개년 입시결과 탭: 전 행의 식별자, 범위, 단위, 반영방법 연결을 검사한다.
    scores = data.get("scores", [])
    ids = [row.get("id") for row in scores]
    if len(ids) != len(set(ids)):
        issue(issues, "3개년 입시결과", "duplicate-id", f"{len(ids) - len(set(ids))}건")
    aliases = score_aliases(app_source)
    profile_name_set = set(profile_names)
    allowed_groups = {"가", "나", "다", "가군", "나군", "다군"}
    missing_percentile = 0
    missing_conversion = 0
    for row in scores:
        row_id = row.get("id")
        for field in ("u", "y", "a", "g", "d", "t", "r", "source"):
            if row.get(field) is None or str(row.get(field)).strip() == "":
                issue(issues, "3개년 입시결과", "blank-field", f"ID {row_id} {field}")
        if row.get("y") not in {2024, 2025, 2026}:
            issue(issues, "3개년 입시결과", "invalid-year", f"ID {row_id}: {row.get('y')}")
        if row.get("g") not in allowed_groups:
            issue(issues, "3개년 입시결과", "invalid-group", f"ID {row_id}: {row.get('g')}")
        metric = re.sub(r"\s+", "", str(row.get("metric", "")))
        if "백분위" in metric:
            for field in ("p50", "p70"):
                value = row.get(field)
                if value is not None and (not isinstance(value, (int, float)) or not 0 <= value <= 100):
                    issue(issues, "3개년 입시결과", "invalid-percentile", f"ID {row_id} {field}: {value}")
        for field in ("n", "c", "x", "add", "cv50", "cv70", "max", "ko", "ma", "inq", "en"):
            value = row.get(field)
            if value is not None and (not isinstance(value, (int, float)) or value < 0):
                issue(issues, "3개년 입시결과", "invalid-number", f"ID {row_id} {field}: {value}")
        source = str(row.get("source", ""))
        if source and urlparse(source).scheme not in {"http", "https"}:
            issue(issues, "3개년 입시결과", "invalid-source", f"ID {row_id}: {source}")
        university = str(row.get("u", ""))
        linked_profile = university if university in profile_name_set else aliases.get(university)
        if linked_profile not in profile_name_set:
            issue(issues, "3개년 입시결과", "unlinked-method", f"ID {row_id}: {university}")
        if row.get("p50") is None and row.get("p70") is None:
            missing_percentile += 1
        if row.get("cv50") is None and row.get("cv70") is None:
            missing_conversion += 1

    # 일정 탭과 상단 전국 수치: 날짜 순서와 산술 일치를 검사한다.
    overview = data.get("overview", {})
    schedule = overview.get("schedule", [])
    if len(schedule) != 5:
        issue(issues, "일정", "schedule-count", str(len(schedule)))
    dates: list[date] = []
    for row in schedule:
        if not str(row.get("label", "")).strip() or not str(row.get("value", "")).strip():
            issue(issues, "일정", "blank-field", json.dumps(row, ensure_ascii=False))
            continue
        matches = re.findall(r"(2027)\.\s*(\d{1,2})\.\s*(\d{1,2})\.", row["value"])
        if not matches:
            issue(issues, "일정", "invalid-date", row["value"])
        for year, month, day in matches:
            dates.append(date(int(year), int(month), int(day)))
    if dates != sorted(dates):
        issue(issues, "일정", "date-order", ", ".join(item.isoformat() for item in dates))

    total = overview.get("totalRegular")
    capital = overview.get("capital")
    non_capital = overview.get("nonCapital")
    if all(isinstance(value, (int, float)) for value in (total, capital, non_capital)) and capital + non_capital != total:
        issue(issues, "정시 변화", "total-arithmetic", f"{capital}+{non_capital}!={total}")
    change = overview.get("change")
    capital_change = overview.get("capitalChange")
    non_capital_change = overview.get("nonCapitalChange")
    if all(isinstance(value, (int, float)) for value in (change, capital_change, non_capital_change)) and capital_change + non_capital_change != change:
        issue(issues, "정시 변화", "change-arithmetic", f"{capital_change}+{non_capital_change}!={change}")
    exam_focused = overview.get("examFocused")
    rate = overview.get("examFocusedRate")
    if isinstance(total, (int, float)) and total and isinstance(exam_focused, (int, float)) and isinstance(rate, (int, float)):
        calculated = round(exam_focused / total * 100, 1)
        if calculated != rate:
            issue(issues, "정시 변화", "rate-arithmetic", f"{calculated}!={rate}")

    official_results = json.loads((ROOT / "audit" / "official-results-summary.json").read_text(encoding="utf-8"))
    reference_2027 = json.loads((ROOT / "audit" / "regular-2027-reference-summary.json").read_text(encoding="utf-8"))
    education = json.loads((ROOT / "audit" / "education-office-sources.json").read_text(encoding="utf-8"))
    if official_results.get("mismatched_rows") != 0 or official_results.get("official_pairs_failed") != 0:
        issue(issues, "3개년 입시결과", "official-crosscheck", json.dumps(official_results, ensure_ascii=False))
    if reference_2027.get("issues") != 0:
        issue(issues, "반영방법", "reference-crosscheck", json.dumps(reference_2027, ensure_ascii=False))
    if education.get("sourceFailures"):
        issue(issues, "전체", "education-office-crosscheck", json.dumps(education["sourceFailures"], ensure_ascii=False))

    report = {
        "tabs": {
            "정시 변화": len(change_ids),
            "반영방법": reference_2027.get("project_reference_rows") or len(profiles),
            "3개년 입시결과": len(scores),
            "일정": len(schedule),
        },
        "missingPublishedValues": {
            "percentileBothBlank": missing_percentile,
            "conversionBothBlank": missing_conversion,
        },
        "officialCrosscheck": {
            "adigaPairs": official_results.get("official_pairs"),
            "adigaMatchedRows": official_results.get("matched_rows"),
            "adigaMismatchedRows": official_results.get("mismatched_rows"),
            "reference2027Rows": reference_2027.get("project_reference_rows"),
            "educationOfficeSources": len(education.get("sources", [])),
        },
        "issues": len(issues),
        "details": issues,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if issues:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
