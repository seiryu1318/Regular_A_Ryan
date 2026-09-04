from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "public" / "regular-2027-reference.json"
DATA_PATH = ROOT / "public" / "admissions-data.json"
REPORT_PATH = ROOT / "audit" / "regular-2027-reference-summary.json"

EXPECTED_HEADERS = ["지역", "대학명", "사탐런유리", "지표", "학생부", "국어", "수학", "미기", "영어", "탐구2", "탐구1", "사탐", "과탐", "특이사항"]
EXPECTED_METRICS = {"표+표", "표+변", "백", "등급", ""}
REQUIRED_LABELS = {
    "대신(신학)", "대신(자전)", "목포가톨릭(간호)", "목포가톨릭(사복유아)", "한예종", "서울장신대",
    "아신대", "중앙승가대", "화성의과학대", "부산장신대", "영남신학대", "DGIST", "POSTECH", "UNIST",
    "한국침례신대", "KAIST", "영산선학대", "호남신대", "GIST", "KENTECH",
}
SCIENCE_INSTITUTES = {"DGIST", "UNIST", "KAIST", "KENTECH"}


def value(row: list, index: int) -> str:
    return str(row[index] if index < len(row) and row[index] is not None else "").strip()


reference = json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
issues: list[str] = []

if reference.get("headers") != EXPECTED_HEADERS:
    issues.append("A:N 헤더 불일치")
rows = reference.get("rows", [])
profiles = data.get("profiles", [])
labels = [value(row, 1) for row in rows]
if len(rows) != 410:
    issues.append(f"원자료 행 수 {len(rows)}")
if len(labels) != len(set(labels)):
    issues.append("원자료 대학별 분리 행 중복")
missing_required = sorted(REQUIRED_LABELS - set(labels))
if missing_required:
    issues.append(f"필수 보완 행 누락: {', '.join(missing_required)}")

profile_by_label: dict[str, tuple[dict, dict]] = {}
for profile in profiles:
    for source_row in profile.get("reference2027Rows", []):
        label = str(source_row.get("label") or "").strip()
        if label in profile_by_label:
            issues.append(f"프로젝트 기준 행 중복 연결: {label}")
        profile_by_label[label] = (profile, source_row)
for index, row in enumerate(rows, 2):
    label = value(row, 1)
    indicator = value(row, 3)
    student = value(row, 4)
    ratio_values = [value(row, column) for column in (5, 6, 8, 9, 10)]
    bonus_values = [value(row, column) for column in (7, 11, 12)]
    note = value(row, 13)
    if indicator not in EXPECTED_METRICS:
        issues.append(f"{index}행 알 수 없는 지표 {indicator}")
    if not indicator and any(ratio_values):
        issues.append(f"{index}행 수능 비율은 있으나 지표가 비어 있음")
    if indicator and not any(ratio_values) and label not in SCIENCE_INSTITUTES:
        # 과학기술원처럼 합산식만 공개된 행은 고정 비율을 요구하지 않는다.
        if not any(token in note for token in ("합산", "점수", "등급", "반영")):
            issues.append(f"{index}행 지표는 있으나 반영 근거가 없음")
    for item in ratio_values + bonus_values:
        if re.search(r"\d+\.%(?:\)|$)", item):
            issues.append(f"{index}행 정수 백분율 점 잔존: {item}")
        valid_source_value = re.fullmatch(
            r"(?:\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?(?:%|점)|\(\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?)+(?:%)?\)|\(\d+(?:\.\d+)?(?:%|점)\))",
            item,
        )
        if item and not valid_source_value:
            issues.append(f"{index}행 비율 형식 확인: {item}")
    if student and not re.match(r"^정(?:량|성)\s+\d+(?:\.\d+)?%", student):
        issues.append(f"{index}행 학생부 형식 확인: {student}")

    linked = profile_by_label.get(label)
    if not linked:
        issues.append(f"{index}행 프로젝트 미연결: {label}")
        continue
    profile, source = linked
    expected_fields = {
        "region": value(row, 0),
        "indicator": indicator,
        "studentRecord": student,
        "korean": value(row, 5),
        "math": value(row, 6),
        "calculusGeometryBonus": value(row, 7),
        "english": value(row, 8),
        "inquiry2": value(row, 9),
        "inquiry1": value(row, 10),
        "socialBonus": value(row, 11),
        "scienceBonus": value(row, 12),
        "note": note,
    }
    for field, expected in expected_fields.items():
        actual = str(source.get(field) or "").strip()
        if actual != expected:
            issues.append(f"{index}행 {label} {field} 불일치: {actual} != {expected}")
    if bool(source.get("socialStudyAdvantage")) != (value(row, 2) == "TRUE"):
        issues.append(f"{index}행 {label} 사탐런유리 불일치")
postech = profile_by_label.get("POSTECH", ({}, {}))[1]
if "단계별" not in postech.get("note", "") or "일반Ⅰ" not in postech.get("note", ""):
    issues.append("POSTECH 일반Ⅰ 단계별 전형 누락")
for label in SCIENCE_INSTITUTES:
    profile, source = profile_by_label.get(label, ({}, {}))
    if not any(source.get(field) for field in ("korean", "math", "english", "inquiry2", "inquiry1")):
        # 비율 공란이 그대로 유지되어야 한다.
        if source.get("korean") or source.get("math") or source.get("english") or source.get("inquiry2") or source.get("inquiry1"):
            issues.append(f"{label} 고정 비율 임의 생성")

summary = {
    "source_rows": len(rows),
    "project_profiles": len(profiles),
    "project_reference_rows": len(profile_by_label),
    "existing_profiles": sum(not profile.get("referenceSupplementOnly") for profile in profiles),
    "supplemental_profiles": sum(bool(profile.get("referenceSupplementOnly")) for profile in profiles),
    "unique_source_labels": len(set(labels)),
    "blank_metrics": sum(not value(row, 3) for row in rows),
    "student_record_rows": sum(bool(value(row, 4)) for row in rows),
    "social_study_advantage_rows": sum(value(row, 2) == "TRUE" for row in rows),
    "parenthesized_ratio_cells": sum(bool(re.fullmatch(r"\(\d+(?:\.\d+)?%\)", value(row, column))) for row in rows for column in (5, 6, 8, 9, 10)),
    "bonus_cells": sum(bool(value(row, column)) for row in rows for column in (7, 11, 12)),
    "issues": len(issues),
    "details": issues,
}
REPORT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
if issues:
    raise SystemExit(1)
