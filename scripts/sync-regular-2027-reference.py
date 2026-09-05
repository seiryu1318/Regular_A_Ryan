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


ALL_TRACKS = ["인문", "자연", "예체능", "의약학"]

TRACK_LABELS = {
    "": "전 모집단위",
    "인": "인문계열",
    "자": "자연계열",
    "경": "경상계열",
    "공": "공학계열",
    "사회": "사회계열",
    "자연": "자연계열",
    "이공": "이공계열",
    "자공": "자연·공학계열",
    "인예": "인문·예체능계열",
    "예체능": "예체능계열",
    "의": "의예과",
    "의예": "의예과",
    "치": "치의예과",
    "한의": "한의예과",
    "한의인": "한의예과 인문형",
    "약": "약학과",
    "약한약": "약학과·한약학과",
    "의약": "의약학계열",
    "의치": "의예과·치의예과",
    "의치약": "의예과·치의예과·약학과",
    "의치약자": "의예과·치의예과·약학과·자연계열",
    "의간": "의예과·한의예과·간호학과",
    "의보건": "한의예과·간호·보건계열",
    "간호": "간호학과",
    "간호물치": "간호학과·물리치료학과",
    "간호방사선": "간호학과·방사선학과",
    "간호임상": "간호학과·임상병리학과",
    "보건": "보건계열",
    "미술": "미술계열",
    "음악": "음악계열",
    "작곡": "작곡과",
    "문창": "문예창작과",
    "스포츠": "스포츠계열",
    "교육": "교육계열",
    "과교": "과학교육계열",
    "수교": "수학교육과",
    "수과교": "수학·과학교육계열",
    "신학": "신학계열",
    "사복유아": "사회복지·유아교육계열",
    "건축": "건축학전공",
    "항공운항": "항공운항학과",
    "국가안보": "국가안보계열",
    "국제": "국제계열",
    "영어": "영어교육과",
    "AI": "AI계열",
    "정보": "정보융합계열",
    "글로벌": "글로벌계열",
    "미래": "미래융합계열",
    "아너스": "사림아너스학부",
    "무전공": "무전공 모집단위",
    "자전": "자유전공학부",
    "자율": "자율전공계열",
    "자율보건": "자율·보건계열",
    "자전기술": "기술경영융합 자유전공",
    "광역": "광역 모집단위",
    "통합": "통합계열",
    "공통": "공통계열",
    "우수순": "성적 우수영역 순 반영 모집단위",
    "국수": "국어·수학 선택형",
    "국탐": "국어·탐구 선택형",
    "수탐": "수학·탐구 선택형",
    "일반": "일반 모집단위",
    "일반1": "일반전형1 모집단위",
    "일반2": "일반전형2 모집단위",
    "일반1 국": "일반전형1 국어 우수형",
    "일반1 수": "일반전형1 수학 우수형",
    "일반2 국": "일반전형2 국어 반영형",
    "일반2 수": "일반전형2 수학 반영형",
    "지균": "지역균형전형 모집단위",
    "A": "A형 적용 모집단위",
    "B": "B형 적용 모집단위",
    "C": "C형 적용 모집단위",
    "인, A": "인문계열 A형",
    "자, B": "자연계열 B형",
    "자-인": "자연계열 사탐 응시형",
    "자-자": "자연계열 과탐 응시형",
    "인천": "인천캠퍼스 모집단위",
    "고양": "고양캠퍼스 모집단위",
    "충청": "충청캠퍼스 모집단위",
    "동두천": "동두천캠퍼스 모집단위",
    "영주": "영주캠퍼스 모집단위",
    "홍성": "홍성캠퍼스 모집단위",
    "강릉": "강릉캠퍼스 모집단위",
    "삼척": "삼척캠퍼스 모집단위",
    "강릉 간호수산": "강릉캠퍼스 간호·수산계열",
    "강릉 치": "강릉캠퍼스 치의예과",
    "춘천 인": "춘천캠퍼스 인문사회계열",
    "춘천 자1": "춘천캠퍼스 자연계열 1유형",
    "춘천 자2": "춘천캠퍼스 자연계열 2유형",
    "가": "가군 모집단위",
    "나": "나군 모집단위",
    "가 40/30": "가군 40/30형 모집단위",
    "가 45/35": "가군 45/35형 모집단위",
    "나 35/30": "나군 35/30형 모집단위",
    "나 45/30": "나군 45/30형 모집단위",
    "다 사범": "다군 사범계열",
    "제1대학": "제1대학 모집단위",
    "제2대학": "제2대학 모집단위",
    "제3대학": "제3대학 모집단위",
    "제4대학": "제4대학 모집단위",
    "공과B": "공과계열 B형",
    "공A": "공학계열 A형",
    "공B": "공학계열 B형",
    "경A": "경상·사회계열 A형",
    "경B": "경상·사회계열 B형",
    "인A": "인문계열 A형",
    "인B": "인문계열 B형",
    "자A": "자연계열 A형",
    "자B": "자연계열 B형",
    "자상": "자연·상경계열",
    "자연공": "자연·공학계열",
    "자연약": "자연계열·약학과",
    "운송": "해상운송계열",
    "해사A": "해사계열 A형",
}

TRACK_LABEL_OVERRIDES = {
    "건국(A)": "언어중심 A형",
    "건국(B)": "수리중심 B형",
    "서강(A)": "A형 적용 모집단위",
    "서강(B)": "B형 적용 모집단위",
}


def track_label(label: str, qualifier: str) -> str:
    if label in TRACK_LABEL_OVERRIDES:
        return TRACK_LABEL_OVERRIDES[label]
    if qualifier in TRACK_LABELS:
        return TRACK_LABELS[qualifier]
    numbered = re.fullmatch(r"([인자])(\d+)", qualifier)
    if numbered:
        base = "인문계열" if numbered.group(1) == "인" else "자연계열"
        return f"{base} {numbered.group(2)}유형"
    typed = re.fullmatch(r"([인자공경])([A-C])", qualifier)
    if typed:
        base = {"인": "인문계열", "자": "자연계열", "공": "공학계열", "경": "경상계열"}[typed.group(1)]
        return f"{base} {typed.group(2)}형"
    return f"{qualifier} 적용 모집단위" if qualifier else "전 모집단위"


def track_categories(label: str, qualifier: str, note: str) -> list[str]:
    compact = re.sub(r"\s+", "", qualifier)
    if compact in {"인", "인1", "인2", "인A", "인B", "인,A", "경", "경A", "경B", "사회", "교육", "신학", "사복유아", "국제", "문창"}:
        return ["인문"]
    if compact in {"자", "자1", "자2", "자A", "자B", "자,B", "자-인", "자-자", "자공", "자상", "자연", "자연공", "이공", "공", "공A", "공B", "공과B", "정보", "AI", "보건", "간호", "간호물치", "간호방사선", "간호임상", "건축", "과교", "수교", "수과교", "항공운항", "운송", "해사A"}:
        return ["자연"]
    if compact in {"예체능", "미술", "음악", "작곡", "스포츠"}:
        return ["예체능"]
    if compact in {"의", "의예", "치", "한의", "한의인", "약", "약한약", "의약", "의치", "의치약"}:
        return ["의약학"]
    if compact in {"의치약자", "자연약"}:
        return ["자연", "의약학"]
    if compact in {"의간", "의보건"}:
        return ["자연", "의약학"]
    if compact == "인예":
        return ["인문", "예체능"]
    if compact.startswith("춘천인"):
        return ["인문"]
    if compact.startswith("춘천자") or compact == "강릉간호수산":
        return ["자연"]
    if compact == "강릉치":
        return ["의약학"]

    # 계열을 뜻하지 않는 캠퍼스명, 전형명, 반영유형은 적용 모집단위를
    # 아래 단계에서 개별 모집단위와 연결하므로 여기서 임의로 좁히지 않는다.
    explicit: list[str] = []
    if re.search(r"의예|치의|한의|약학|수의", note):
        explicit.append("의약학")
    if re.search(r"간호|보건|자연계열|공학계열|이공계열", note):
        explicit.append("자연")
    if re.search(r"예체능|미술|음악|작곡|문예창작|체육|스포츠", note):
        explicit.append("예체능")
    if re.search(r"인문계열|인문사회|사회계열|경영경제|신학|사회복지|유아교육", note):
        explicit.append("인문")
    return [category for category in ALL_TRACKS if category in explicit] or ALL_TRACKS.copy()


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
    display_track = track_label(label, qualifier)
    categories = track_categories(label, qualifier, row["특이사항"])
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
        "trackCode": qualifier,
        "trackLabel": display_track,
        "trackCategories": categories,
        "sourceRow": index + 1,
    }
    grouped_rows.setdefault(university, []).append(source_row)
    if student:
        evaluation = "정성평가" if student.startswith("정성") else "정량평가"
        student_records.append({
            "u": university,
            "method": f"{display_track} {student}".strip(),
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
