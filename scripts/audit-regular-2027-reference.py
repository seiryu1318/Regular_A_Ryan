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
    "대신(신학)", "대신(자전)", "목포가톨릭(간호)", "목포가톨릭(사복유아)", "한예종", "서울장신",
    "아신대", "중앙승가", "화성의과학대", "부산장신", "영남신학대", "DGIST", "POSTECH", "UNIST",
    "한국침례신대", "KAIST", "영산선학", "호남신대", "GIST", "KENTECH",
    "경희(한의인)", "경희(한의예 자)", "성신(간호인)", "성신(간호자)",
    "가천(일반1)", "가천(일반2)", "가천(의약)", "가천(한의)",
    "대구한의(한의인)", "대구한의(한의자)", "동국WISE(한의1)", "동국WISE(한의2)",
    "동의(한의확통)", "동의(한의미기)", "상지(한의A)", "상지(한의B)",
    "동신(의보건)", "동신(한의)", "원광(의치약자)", "원광(한의자)",
    "호원(간호)", "호원(일반)",
}
SCIENCE_INSTITUTES = {"DGIST", "UNIST", "KAIST", "KENTECH"}
TRACK_CATEGORIES = {"인문", "자연", "예체능", "의약학"}
RAW_TRACK_LABELS = {"인", "자", "경", "공", "의", "약", "한의", "간호", "A", "B", "C", "일반", "자전"}
EXPECTED_SPLIT_CATEGORIES = {
    "POSTECH": ["자연"],
    "성신(간호인)": ["자연"],
    "성신(간호자)": ["자연"],
    "가천(일반1)": ["인문", "자연"],
    "가천(일반2)": ["인문", "자연"],
    "동신(의보건)": ["자연"],
    "호원(간호)": ["자연"],
}
RESOLVED_SOURCE_CONFLICTS = {
    "동국WISE(일반)": {
        "previous": "학생부 정량 10% (일부), 일부 수능 90%와 학생부 10%",
        "corrected": "학생부 공란, 국어·수학·영어·탐구2 중 상위 2개 각 50%",
        "resolution": "원본 정시 시트 E228·N228이 공식 최종 모집요강에 맞게 수정되어 별도 덮어쓰기 없이 동기화",
        "source": "https://ipsi.dongguk.ac.kr/resources/files/jungsi_2027.pdf",
    },
}


def value(row: list, index: int) -> str:
    return str(row[index] if index < len(row) and row[index] is not None else "").strip()


def normalized_percentage(item: str) -> str:
    item = re.sub(r"(?<=\d)\.(?=%)", "", item)
    item = re.sub(r"(?<=\d)\.(?=%\))", "", item)
    grouped = re.fullmatch(r"\((\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?)+)\)", item)
    if grouped:
        return "(" + " / ".join(f"{part.strip()}%" for part in grouped.group(1).split("/")) + ")"
    return item


def expected_metrics(label: str, indicator: str) -> list[str]:
    if label == "단국천안(의약)":
        return ["백분위", "표준점수"]
    return {
        "표+표": ["표준점수"],
        "표+변": ["표준점수", "변환표준점수"],
        "백": ["백분위"],
        "등급": ["등급"],
    }.get(indicator, [])


reference = json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
issues: list[str] = []

if reference.get("headers") != EXPECTED_HEADERS:
    issues.append("A:N 헤더 불일치")
rows = reference.get("rows", [])
profiles = data.get("profiles", [])
labels = [value(row, 1) for row in rows]
if len(rows) != 438:
    issues.append(f"원자료 행 수 {len(rows)}")
if reference.get("range") != "A1:N439":
    issues.append(f"원자료 범위 {reference.get('range')}")
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
    track_label = str(source.get("trackLabel") or "").strip()
    track_code = str(source.get("trackCode") or "").strip()
    track_categories = source.get("trackCategories") or []
    if not track_label or track_label in RAW_TRACK_LABELS:
        issues.append(f"{index}행 {label} 계열 약칭 잔존: {track_label}")
    if not isinstance(track_categories, list) or not track_categories or any(category not in TRACK_CATEGORIES for category in track_categories):
        issues.append(f"{index}행 {label} 계열 분류 오류: {track_categories}")
    if track_code == "인" and track_categories != ["인문"]:
        issues.append(f"{index}행 {label} 인문계열 분류 오류: {track_categories}")
    if track_code == "자" and track_categories != ["자연"]:
        issues.append(f"{index}행 {label} 자연계열 분류 오류: {track_categories}")
    if track_code == "간호" and track_categories != ["자연"]:
        issues.append(f"{index}행 {label} 간호학과 분류 오류: {track_categories}")
    if label in EXPECTED_SPLIT_CATEGORIES and track_categories != EXPECTED_SPLIT_CATEGORIES[label]:
        issues.append(f"{index}행 {label} 세분 계열 분류 오류: {track_categories}")
    expected_fields = {
        "region": value(row, 0),
        "indicator": indicator,
        "studentRecord": student,
        "korean": normalized_percentage(value(row, 5)),
        "math": normalized_percentage(value(row, 6)),
        "calculusGeometryBonus": normalized_percentage(value(row, 7)),
        "english": normalized_percentage(value(row, 8)),
        "inquiry2": normalized_percentage(value(row, 9)),
        "inquiry1": normalized_percentage(value(row, 10)),
        "socialBonus": normalized_percentage(value(row, 11)),
        "scienceBonus": normalized_percentage(value(row, 12)),
        "note": note,
    }
    for field, expected in expected_fields.items():
        actual = str(source.get(field) or "").strip()
        if actual != expected:
            issues.append(f"{index}행 {label} {field} 불일치: {actual} != {expected}")
    metrics = expected_metrics(label, indicator)
    if source.get("metrics", []) != metrics:
        issues.append(
            f"{index}행 {label} 활용지표 불일치: {source.get('metrics')} != {metrics}"
        )
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

limited_metric_rows = [row for row in rows if value(row, 3) in {"", "등급"}]
if len(limited_metric_rows) != 34:
    issues.append(f"백분위·표준점수 미사용 행 수 {len(limited_metric_rows)}")

silla = profile_by_label.get("신라대", ({}, {}))[1]
if not (
    silla.get("korean") == "25%"
    and silla.get("math") == "25%"
    and silla.get("english") == "25%"
    and silla.get("inquiry2") == ""
    and silla.get("inquiry1") == "25%"
    and "상위 1과목" in silla.get("note", "")
):
    issues.append("신라대 탐구 상위 1과목 25% 반영 불일치")

dankook_medical = profile_by_label.get("단국천안(의약)", ({}, {}))[1]
if not (
    dankook_medical.get("korean") == "25%"
    and dankook_medical.get("math") == "35%"
    and dankook_medical.get("english") == "15%"
    and dankook_medical.get("inquiry2") == "25%"
    and dankook_medical.get("scienceBonus") == "5%"
    and "과탐Ⅱ" in dankook_medical.get("note", "")
):
    issues.append("단국천안(의약) 25/35/15/25 및 과탐Ⅱ 5% 불일치")
if set(dankook_medical.get("metrics", [])) != {"백분위", "표준점수"}:
    issues.append(f"단국천안(의약) 혼합 활용지표 불일치: {dankook_medical.get('metrics')}")

summary = {
    "source_rows": len(rows),
    "project_profiles": len(profiles),
    "project_reference_rows": len(profile_by_label),
    "existing_profiles": sum(not profile.get("referenceSupplementOnly") for profile in profiles),
    "supplemental_profiles": sum(bool(profile.get("referenceSupplementOnly")) for profile in profiles),
    "unique_source_labels": len(set(labels)),
    "blank_metrics": sum(not value(row, 3) for row in rows),
    "grade_only_or_blank_metrics": len(limited_metric_rows),
    "student_record_rows": sum(bool(value(row, 4)) for row in rows),
    "social_study_advantage_rows": sum(value(row, 2) == "TRUE" for row in rows),
    "parenthesized_ratio_cells": sum(bool(re.fullmatch(r"\(\d+(?:\.\d+)?%\)", value(row, column))) for row in rows for column in (5, 6, 8, 9, 10)),
    "bonus_cells": sum(bool(value(row, column)) for row in rows for column in (7, 11, 12)),
    "resolved_source_conflicts": [
        {"label": label, **details}
        for label, details in RESOLVED_SOURCE_CONFLICTS.items()
    ],
    "issues": len(issues),
    "details": issues,
}
REPORT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
if issues:
    raise SystemExit(1)
