from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
OFFICIAL_AUDIT_PATH = ROOT / "audit" / "official-results-audit.csv"
SUMMARY_PATH = ROOT / "audit" / "conversion-maxima-summary.json"
VERIFIED_STATUSES = {"일치", "수치 지문 일치", "대학 공식자료 별도 확인"}
SPECIAL_PATTERN = re.compile(r"특성화고|농어촌|기초생활|차상위|지역인재|특별전형|재외국민")


def compact(value: object) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", str(value or "")).lower()


def exam_variant(row: dict) -> int:
    value = compact(row.get("exam") or row.get("a"))
    if re.search(r"일반(?:학생|전형)?(?:Ⅱ|ⅱ|2)|일반2전형", value):
        return 2
    if re.search(r"일반(?:학생|전형)?(?:Ⅲ|ⅲ|3)|일반3전형", value):
        return 3
    return 1 if "일반" in value or "정시" in value else 0


def admissible_maximum(row: dict, maximum: float | int) -> bool:
    published_scores = [row.get("cv50"), row.get("cv70")]
    published_scores = [float(value) for value in published_scores if isinstance(value, (int, float))]
    return not published_scores or max(published_scores) <= float(maximum) * 1.02


with OFFICIAL_AUDIT_PATH.open(encoding="utf-8-sig", newline="") as handle:
    official_rows = list(csv.DictReader(handle))

verified_ids = {
    int(row["id"])
    for row in official_rows
    if row.get("id") and row.get("status") in VERIFIED_STATUSES
}

data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
scores = data.get("scores", [])
for row in scores:
    if str(row.get("maxSource") or "").startswith("2024, 2025 대학어디가"):
        row["max"] = None
        row.pop("maxSource", None)
prior_rows = [
    row
    for row in scores
    if row.get("y") in {2024, 2025}
    and row.get("max") is not None
    and int(row.get("id", 0)) in verified_ids
    and not SPECIAL_PATTERN.search(f"{row.get('exam', '')} {row.get('a', '')}")
]

by_department: dict[tuple[str, str, int], list[dict]] = defaultdict(list)
by_university: dict[str, list[dict]] = defaultdict(list)
for row in prior_rows:
    by_department[(str(row.get("u")), compact(row.get("d")), exam_variant(row))].append(row)
    by_university[str(row.get("u"))].append(row)


def stable_maximum(rows: list[dict]) -> float | int | None:
    years = {int(row["y"]) for row in rows}
    values = {row["max"] for row in rows if row.get("max") is not None}
    if years != {2024, 2025} or len(values) != 1:
        return None
    return next(iter(values))


filled_department = 0
filled_university = 0
for row in scores:
    if row.get("y") != 2026 or row.get("max") is not None or int(row.get("id", 0)) not in verified_ids:
        continue
    if SPECIAL_PATTERN.search(f"{row.get('exam', '')} {row.get('a', '')}"):
        continue
    candidate = stable_maximum(by_department.get((str(row.get("u")), compact(row.get("d")), exam_variant(row)), []))
    method = "모집단위"
    if candidate is None:
        candidate = stable_maximum(by_university.get(str(row.get("u")), []))
        method = "대학"
    if candidate is None or not admissible_maximum(row, candidate):
        continue
    row["max"] = candidate
    row["maxSource"] = f"2024, 2025 대학어디가 {method} 환산만점 일치"
    if method == "모집단위":
        filled_department += 1
    else:
        filled_university += 1

remaining = sum(row.get("y") == 2026 and row.get("max") is None for row in scores)
summary = {
    "verified_official_rows": len(verified_ids),
    "filled_by_department_history": filled_department,
    "filled_by_university_history": filled_university,
    "filled_total": filled_department + filled_university,
    "remaining_without_published_maximum": remaining,
}
DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
