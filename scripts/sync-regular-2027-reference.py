from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "public" / "regular-2027-reference.json"
DATA_PATH = ROOT / "public" / "admissions-data.json"

SOURCE_URL = "https://docs.google.com/spreadsheets/d/1teV1-aE6u7ueHC5o1B3iRHCRN-SSvONpN5pcOGLc4K8/edit?gid=214183197#gid=214183197"
EXPECTED_HEADERS = ["지역", "대학명", "사탐런유리", "지표", "학생부", "국어", "수학", "미기", "영어", "탐구2", "탐구1", "사탐", "과탐", "특이사항"]

BASE_ALIASES = {
    "성균": "성균관대",
    "한국외대": "한국외국어대",
    "이화": "이화여대",
    "숙명": "숙명여대",
    "감리교신학대": "감리교신학대",
    "덕성": "덕성여대",
    "동덕": "동덕여대",
    "성신": "성신여대",
    "장로회신대": "장로회신학대",
    "추계": "추계예술대",
    "가톨": "가톨릭대",
    "인천가톨": "인천가톨릭대",
    "차의과": "차의과학대",
    "한양ERICA": "한양대(ERICA)",
    "대구예대": "대구예술대",
    "대신": "대신대",
    "동국WISE": "동국대(WISE)",
    "한국해양": "국립한국해양대",
    "건국글로컬": "건국대(글)",
    "고려세종": "고려대(세종)",
    "국립공주": "공주대",
    "국립한국교통대": "한국교통대",
    "단국천안": "단국대(천안)",
    "상명천안": "상명대(천안)",
    "우석진천": "우석대",
    "우석완주": "우석대",
    "한국기술교대": "한국기술교육대",
    "홍익세종": "홍익대(세종)",
    "연세미래": "연세대(미래)",
    "KENTECH": "한국에너지공과대",
}

METRICS = {
    "표+표": ["표준점수"],
    "표+변": ["표준점수", "변환표준점수"],
    "백": ["백분위"],
    "등급": ["등급"],
}


def text(value: object) -> str:
    return str(value or "").strip()


def clean_percentage(value: object) -> str:
    result = text(value)
    result = re.sub(r"(?<=\d)\.(?=%)", "", result)
    result = re.sub(r"(?<=\d)\.(?=%\))", "", result)
    return result


def split_label(label: str) -> tuple[str, str]:
    match = re.match(r"^(.*?)\((.*)\)$", label)
    return (match.group(1).strip(), match.group(2).strip()) if match else (label, "")


def canonical_university(label: str, known: set[str]) -> str:
    base, _ = split_label(label)
    if base in BASE_ALIASES:
        return BASE_ALIASES[base]
    if base in known:
        return base
    if f"{base}대" in known:
        return f"{base}대"
    return base


def track_categories(label: str, note: str) -> list[str]:
    _, qualifier = split_label(label)
    source = f"{label} {qualifier} {note}".lower()
    categories: list[str] = []

    def add(value: str) -> None:
        if value not in categories:
            categories.append(value)

    if re.search(r"의예|치의|한의|약학|의약|수의", source):
        add("의약학")
    if re.search(r"간호|보건|이공|자연|공학|수학|과학|기술|정보|ai|반도체|항공|건축|자전|광역", source):
        add("자연")
    if re.search(r"예체능|미술|음악|작곡|문창|체육|스포츠|예대|한예종", source):
        add("예체능")
    if re.search(r"인문|사회|경영|상경|국어|영어|교육|신학|사복|유아|인\b", source):
        add("인문")
    if "의간" in source:
        add("자연")
        add("의약학")
    if not categories:
        categories.extend(["인문", "자연"])
    order = ["인문", "자연", "예체능", "의약학"]
    return [value for value in order if value in categories]


def history_method(note: str) -> str:
    if not "한국사" in note:
        return "—"
    if re.search(r"한국사.{0,30}감점|감점.{0,30}한국사", note):
        return "감점"
    if re.search(r"한국사.{0,30}(?:가점|가산)|(?:가점|가산).{0,30}한국사", note):
        return "가점"
    if re.search(r"한국사.{0,30}(?:등급점수|등급 점수|환산|반영점수)", note):
        return "등급 환산"
    return "—"


def english_method(english: str, note: str) -> str:
    if re.search(r"영어.{0,30}감점|감점.{0,30}영어", note):
        return "감점"
    if english or re.search(r"영어.{0,30}(?:등급점수|등급 점수|환산|반영점수)", note):
        return "등급 환산"
    return "—"


def change_category(row: dict[str, str]) -> str:
    if row["사탐런유리"] == "TRUE":
        return "사탐런"
    if row["미기"] or row["사탐"] or row["과탐"]:
        return "가산점"
    if row["학생부"]:
        return "학생부"
    return "반영방법"


def method_summary(row: dict[str, str]) -> str:
    parts = []
    if row["지표"]:
        parts.append(f"지표 {row['지표']}")
    if row["학생부"]:
        parts.append(f"학생부 {row['학생부']}")
    for key in ("국어", "수학", "영어", "탐구2", "탐구1"):
        if row[key]:
            parts.append(f"{key} {row[key]}")
    for key in ("미기", "사탐", "과탐"):
        if row[key]:
            parts.append(f"{key} {row[key]} 가산")
    if row["사탐런유리"] == "TRUE":
        parts.append("사탐런 유리")
    if row["특이사항"]:
        parts.append(row["특이사항"])
    return ", ".join(parts)


reference = json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
if reference.get("headers") != EXPECTED_HEADERS:
    raise SystemExit(f"정시 탭 헤더 불일치: {reference.get('headers')}")

# 기준 시트는 기존 프로젝트를 대체하지 않는다. 기존 대학 프로필과 변경사항,
# 입시결과는 그대로 두고 2027 반영방법을 대학별 보완 자료로 병합한다.
profiles = [profile for profile in data.get("profiles", []) if not profile.get("referenceSupplementOnly")]
for profile in profiles:
    profile.pop("reference2027", None)
    profile.pop("reference2027Rows", None)

known_names = {text(profile.get("u")) for profile in profiles}
profile_by_name: dict[str, dict] = {}
for profile in profiles:
    profile_by_name.setdefault(text(profile.get("u")), profile)

grouped_rows: dict[str, list[dict]] = {}
student_records = [
    row for row in data.get("studentRecord", [])
    if row.get("sourceFile") != SOURCE_URL
]

for index, values in enumerate(reference["rows"], 1):
    padded = list(values) + [None] * (len(EXPECTED_HEADERS) - len(values))
    row = {header: text(padded[position]) for position, header in enumerate(EXPECTED_HEADERS)}
    for key in ("국어", "수학", "미기", "영어", "탐구2", "탐구1", "사탐", "과탐"):
        row[key] = clean_percentage(row[key])
    label = row["대학명"]
    university = canonical_university(label, known_names)
    _, qualifier = split_label(label)
    track_label = qualifier or "전 모집단위"
    categories = track_categories(label, row["특이사항"])
    student = row["학생부"]
    metrics = METRICS.get(row["지표"], [])
    source_row = {
        "label": label,
        "region": row["지역"],
        "socialStudyAdvantage": row["사탐런유리"] == "TRUE",
        "indicator": row["지표"],
        "studentRecord": student,
        "korean": row["국어"],
        "math": row["수학"],
        "calculusGeometryBonus": row["미기"],
        "english": row["영어"],
        "inquiry2": row["탐구2"],
        "inquiry1": row["탐구1"],
        "socialBonus": row["사탐"],
        "scienceBonus": row["과탐"],
        "note": row["특이사항"],
        "trackLabel": track_label,
        "trackCategories": categories,
        "sourceRow": index + 1,
    }
    grouped_rows.setdefault(university, []).append(source_row)
    if student:
        evaluation = "정성평가" if student.startswith("정성") else "정량평가"
        student_records.append({
            "u": university,
            "method": f"{track_label} {student}".strip(),
            "type": evaluation,
            "sourceFile": SOURCE_URL,
        })

next_id = max((int(profile.get("id", 0)) for profile in profiles), default=0) + 1
supplemental_profiles = 0
for university, source_rows in grouped_rows.items():
    profile = profile_by_name.get(university)
    if profile is None:
        profile = {
            "id": next_id,
            "u": university,
            "formal": university,
            "r": source_rows[0]["region"],
            "selection": source_rows[0]["note"],
            "ratio": "",
            "metric": "",
            "metrics": [],
            "sb": None,
            "sbDetail": "",
            "sourceFile": SOURCE_URL,
            "sourcePage": source_rows[0]["sourceRow"],
            "officialSourceFile": "정시 탭 A:N",
            "historyMethod": history_method(source_rows[0]["note"]),
            "admission": None,
            "resultSource": SOURCE_URL,
            "referenceSupplementOnly": True,
        }
        profiles.append(profile)
        profile_by_name[university] = profile
        next_id += 1
        supplemental_profiles += 1

    profile["reference2027Rows"] = source_rows
    source_metrics = []
    for source_row in source_rows:
        for metric in METRICS.get(source_row["indicator"], []):
            if metric not in source_metrics:
                source_metrics.append(metric)
    if source_metrics:
        profile["metrics"] = source_metrics
        profile["metric"] = ", ".join(source_metrics)
    if any(source_row["studentRecord"] for source_row in source_rows):
        profile["sb"] = True
        profile["sbDetail"] = ", ".join(
            dict.fromkeys(source_row["studentRecord"] for source_row in source_rows if source_row["studentRecord"])
        )
    profile["resultSource"] = SOURCE_URL

data["profiles"] = profiles
data["studentRecord"] = student_records
data.setdefault("summary", {})["profiles"] = len(profiles)
data["summary"]["changeRows"] = len(data.get("changes", []))
data["summary"]["reference2027Rows"] = len(reference["rows"])
data["reference2027"] = {
    "source": SOURCE_URL,
    "sheet": "정시",
    "range": "A1:N411",
    "rows": len(reference["rows"]),
    "matchedExistingProfiles": len(grouped_rows) - supplemental_profiles,
    "supplementalProfiles": supplemental_profiles,
}
data["sources"] = [
    {"name": "2027 정시 기준 자료", "organization": "Google Sheets 정시 탭", "url": SOURCE_URL},
    *[source for source in data.get("sources", []) if source.get("url") != SOURCE_URL],
]

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(json.dumps({
    "profiles": len(profiles),
    "existing_profiles": len(profiles) - supplemental_profiles,
    "supplemental_profiles": supplemental_profiles,
    "reference_rows": len(reference["rows"]),
    "changes": len(data.get("changes", [])),
    "student_records": len(student_records),
    "blank_metrics": sum(not source_row["indicator"] for source_rows in grouped_rows.values() for source_row in source_rows),
    "social_study_advantage": sum(source_row["socialStudyAdvantage"] for source_rows in grouped_rows.values() for source_row in source_rows),
}, ensure_ascii=False, indent=2))
