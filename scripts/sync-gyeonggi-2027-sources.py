from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pdfplumber
from pdfminer.high_level import extract_text
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "gyeonggi-2027-source-audit.json"

HTML_SOURCE = Path(
    r"C:\Users\User\iCloudDrive\02. 진학 및 상담자료\01. 진학자료\01. 연도별 진학자료\07. 2026년\01. 전형방법\03. 모집요강\05. 정시모집\02. 관련 자료\2027 정시 모집정보 검색기(영덕고-김형진).html"
)
PDF_SOURCE = Path(
    r"C:\Users\User\iCloudDrive\02. 진학 및 상담자료\01. 진학자료\01. 연도별 진학자료\07. 2026년\01. 전형방법\03. 모집요강\05. 정시모집\02. 관련 자료\2027 정시전형 모집요강(경기도교육청 진학지도리더교사 콘텐츠팀).pdf"
)

SOURCE_DATE = "2026-09-17"
SPECIAL_ADMISSION_PATTERN = re.compile(
    r"특성화|농어촌|기회균형|저소득|재외국민|장애|특수교육대상|북한이탈|만학도|자율전공\s*특별"
)
COMMON_FLEXIBLE_PATTERN = re.compile(
    r"자유전공|자율전공|무전공|전공자유|자유융합"
)

SOURCE_ALIASES = {
    "강원대(강릉원주)": "강원대(강릉원주대)",
    "강원대(삼척)": "강원대",
    "강원대(춘천)": "강원대",
    "서울과학기술대": "서울과기대",
    "서울신대": "서울신학대",
    "장로회신대": "장로회신학대",
    "추계예대": "추계예술대",
    "한국기술교대": "한국기술교육대",
    "한국외대(글로벌)": "한국외국어대",
}

PDF_ALIASES = {
    "경인교육대학교": "경인교대",
    "공주교육대학교": "공주교대",
    "광주과학기술원": "GIST",
    "광주교육대학교": "광주교대",
    "광주여자대학교": "광주여대",
    "국립금오공과대": "국립금오공대",
    "단국대학교(죽전)": "단국대",
    "대구경북과기원": "DGIST",
    "대구교육대학교": "대구교대",
    "덕성여자대학교": "덕성여대",
    "동덕여자대학교": "동덕여대",
    "명지대학교(용인)": "명지대",
    "부산교육대학교": "부산교대",
    "부산외국어대학": "부산외대",
    "서울과학기술대": "서울과기대",
    "서울교육대학교": "서울교대",
    "서울여자대학교": "서울여대",
    "성신여자대학교": "성신여대",
    "숙명여자대학교": "숙명여대",
    "예원예술대학교": "예원예대",
    "울산과학기술원": "UNIST",
    "이화여자대학교": "이화여대",
    "전주교육대학교": "전주교대",
    "중앙대학교(다빈치)": "중앙대",
    "진주교육대학교": "진주교대",
    "청주교육대학교": "청주교대",
    "춘천교육대학교": "춘천교대",
    "포항공과대학교": "POSTECH",
    "한국과학기술원": "KAIST",
    "한국에너지공대": "한국에너지공과대",
    "한국예술종합학교": "한예종",
    "한국침례신학대": "한국침례신대",
    "호남신학대학교": "호남신대",
    "강원대학교(춘천삼척)": "강원대",
    "강원대학교(강릉원주)": "강원대(강릉원주대)",
    "건국대학교(서울)": "건국대",
    "고려대학교(서울)": "고려대",
    "연세대학교(미래)": "연세대(미래)",
    "목포가톨릭대학": "목포가톨릭대",
    "인천가톨릭대학": "인천가톨릭대",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def compact(value: object) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", str(value or "")).lower()


def normalize_university(value: object) -> str:
    text = str(value or "").strip()
    text = text.replace("대학교", "대").replace("대학", "대")
    text = text.replace("국립", "").replace("학교", "")
    text = text.replace("(서울)", "").replace("(본교)", "")
    text = text.replace("(글로컬)", "(글)").replace("한국외대", "한국외국어대")
    text = text.replace("감리교신대", "감리교신학대")
    return compact(text)


def profile_index(profiles: list[dict]) -> dict[str, list[dict]]:
    index: dict[str, list[dict]] = defaultdict(list)
    for profile in profiles:
        for label in (profile.get("u"), profile.get("formal")):
            key = normalize_university(label)
            if key and profile not in index[key]:
                index[key].append(profile)
    return index


def find_profile(
    label: str,
    profiles: list[dict],
    index: dict[str, list[dict]],
    aliases: dict[str, str],
) -> dict | None:
    target = aliases.get(label)
    if target:
        return next((profile for profile in profiles if profile.get("u") == target), None)
    matches = index.get(normalize_university(label), [])
    return matches[0] if len(matches) == 1 else None


def extract_html_rows(path: Path) -> list[dict]:
    content = path.read_text(encoding="utf-8")
    match = re.search(
        r'<script id="data" type="application/json">(.*?)</script>',
        content,
        flags=re.DOTALL,
    )
    if not match:
        raise RuntimeError("첨부 HTML의 data JSON을 찾지 못했습니다.")
    rows = json.loads(match.group(1))
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("첨부 HTML의 data JSON이 비어 있습니다.")
    return rows


def classify_track(department: str, source_track: str, detailed_track: str) -> str:
    text = compact(f"{department} {detailed_track}")
    if re.search(r"의예|치의예|치의학|한의예|한의학|약학|제약학|수의예|수의학|의과대", text):
        return "의약학"
    if re.search(
        r"간호|임상병리|물리치료|작업치료|치위생|방사선|응급구조|재활치료|언어치료|청각재활",
        text,
    ):
        return "자연"
    if re.search(
        r"예체능|미술|디자인|음악|성악|작곡|피아노|관현악|무용|체육|스포츠|연극|영화|공연|조형|회화|공예|사진|웹툰|만화|애니메이션|뷰티|패션|실용음악|골프|태권도|경호|레저",
        text,
    ):
        return "예체능"
    if source_track in {"인문", "자연"}:
        return source_track
    if re.search(
        r"공학|과학|수학|통계|물리|화학|생명|환경|컴퓨터|소프트웨어|ai|인공지능|데이터|반도체|전자|기계|건축|토목|항공|산업|식품|에너지|스마트|it|ict",
        text,
    ):
        return "자연"
    return "인문"


def clean_text(value: object) -> str:
    text = str(value or "").strip()
    return "" if text == "자료 미기재" else text


def unit_key(row: dict, university: str) -> tuple:
    return (
        university,
        clean_text(row.get("전형명")),
        clean_text(row.get("모집군")),
        clean_text(row.get("계열")),
        clean_text(row.get("상세계열")),
        clean_text(row.get("모집단위")),
        row.get("모집인원"),
        clean_text(row.get("캠퍼스")),
    )


def historical_department_keys(scores: list[dict]) -> set[tuple[str, str]]:
    aliases = {
        "강원대(강릉)": "강원대(강릉원주대)",
        "강원대(원주)": "강원대(강릉원주대)",
        "한국외대": "한국외국어대",
        "한국외대(글)": "한국외국어대",
        "단국대(죽전)": "단국대",
    }
    return {
        (aliases.get(str(row.get("u")), str(row.get("u"))), compact(row.get("d")))
        for row in scores
        if row.get("d")
    }


def build_units(
    rows: list[dict], profiles: list[dict], scores: list[dict]
) -> tuple[list[dict], list[str], int]:
    index = profile_index(profiles)
    grouped: dict[tuple, dict] = {}
    unmatched: set[str] = set()
    excluded = 0
    historical = historical_department_keys(scores)

    for row in rows:
        exam_name = clean_text(row.get("전형명"))
        if SPECIAL_ADMISSION_PATTERN.search(exam_name):
            excluded += 1
            continue
        source_university = clean_text(row.get("대학명"))
        profile = find_profile(source_university, profiles, index, SOURCE_ALIASES)
        if not profile:
            unmatched.add(source_university)
            continue
        university = str(profile["u"])
        key = unit_key(row, university)
        record = grouped.get(key)
        if record is None:
            department = clean_text(row.get("모집단위"))
            detailed_track = clean_text(row.get("상세계열"))
            group = clean_text(row.get("모집군"))
            source_track = clean_text(row.get("계열"))
            track_category = classify_track(
                department, source_track, detailed_track
            )
            track_categories = (
                ["인문", "자연"]
                if source_track == "공통"
                and COMMON_FLEXIBLE_PATTERN.search(
                    compact(f"{department} {detailed_track}")
                )
                else [track_category]
            )
            record = {
                "id": 0,
                "u": university,
                "sourceUniversity": source_university,
                "r": clean_text(row.get("지역")) or profile.get("r", ""),
                "examName": exam_name,
                "admissionGroup": f"{group}군" if group else "군외",
                "sourceTrack": source_track,
                "trackCategory": track_category,
                "trackCategories": track_categories,
                "detailedTrack": detailed_track,
                "department": department,
                "quota": row.get("모집인원") if isinstance(row.get("모집인원"), int) else None,
                "campus": clean_text(row.get("캠퍼스")),
                "stages": [],
                "examDomains": clean_text(row.get("수능 반영영역")),
                "inquiryCount": row.get("탐구 반영수") if isinstance(row.get("탐구 반영수"), int) else None,
                "mathChoices": clean_text(row.get("수학 선택과목")),
                "inquiryTypes": clean_text(row.get("탐구 유형")),
                "minimum": clean_text(row.get("최저학력기준")),
                "specialNote": clean_text(row.get("전형·반영 특이사항")),
                "sourceRows": [],
                "historicalNameConfirmed": (university, compact(department)) in historical,
                "officialNameConfirmed": False,
                "sourceFile": HTML_SOURCE.name,
                "sourceSha256": sha256(HTML_SOURCE),
            }
            grouped[key] = record
        stage = clean_text(row.get("선발방식"))
        if stage and stage not in record["stages"]:
            record["stages"].append(stage)
        source_row = row.get("원문 행")
        if isinstance(source_row, int) and source_row not in record["sourceRows"]:
            record["sourceRows"].append(source_row)

    units = sorted(
        grouped.values(),
        key=lambda item: (
            item["u"],
            item["admissionGroup"],
            item["examName"],
            item["department"],
        ),
    )
    for identifier, unit in enumerate(units, 1):
        unit["id"] = identifier
        unit["stages"].sort(key=lambda value: {"1단계": 0, "2단계": 1, "일괄합산": 2}.get(value, 9))
        unit["sourceRows"].sort()
    return units, sorted(unmatched), excluded


def extract_pdf_directory(path: Path) -> dict[str, dict[str, str]]:
    with pdfplumber.open(path) as document:
        page = document.pages[0]
        height = page.height
        words = page.extract_words(x_tolerance=2, y_tolerance=2)
    annotations = []
    for annotation in PdfReader(str(path)).pages[0].get("/Annots", []):
        item = annotation.get_object()
        action = item.get("/A")
        uri = action.get("/URI") if action else None
        if not uri:
            continue
        x0, y0, x1, y1 = map(float, item.get("/Rect"))
        annotations.append((uri, x0, height - y1, x1, height - y0))

    columns = [(18, 130), (135, 247), (252, 364), (369, 481), (486, 598), (603, 715)]

    def label_for(box: tuple[str, float, float, float, float]) -> str:
        _, x0, top, x1, bottom = box
        center_y = (top + bottom) / 2
        center_x = (x0 + x1) / 2
        column = next(
            ((start, end) for start, end in columns if start <= center_x <= end),
            None,
        )
        if column is None:
            return ""
        start, end = column
        candidates = [
            word
            for word in words
            if start <= word["x0"] <= end
            and abs((word["top"] + word["bottom"]) / 2 - center_y) <= 4.5
            and word["text"] not in {"요강", "26"}
            and word["x0"] < x0 + 1
        ]
        if not candidates:
            candidates = [
                word
                for word in words
                if start <= word["x0"] <= end
                and abs((word["top"] + word["bottom"]) / 2 - center_y) <= 6
                and word["text"] not in {"요강", "26"}
            ]
        return min(candidates, key=lambda word: word["x0"])["text"] if candidates else ""

    directory: dict[str, dict[str, str]] = defaultdict(dict)
    for annotation in annotations:
        uri = annotation[0]
        if uri.startswith("www."):
            uri = f"https://{uri}"
        label = label_for(annotation)
        if not label or label == "웹버전바로가기":
            continue
        if "adiga.kr" in uri:
            kind = "adiga2027Url"
        elif "drive.google.com/file" in uri:
            kind = "prospectusUrl2027"
        else:
            kind = "admissionUrl"
        directory[label][kind] = uri
    return dict(directory)


def official_name_worker(payload: tuple[str, str, list[tuple[int, str]]]) -> tuple[str, list[int], str]:
    university, source_path, candidates = payload
    try:
        text = compact(extract_text(source_path))
        matched = [identifier for identifier, department in candidates if compact(department) in text]
        return university, matched, ""
    except Exception as error:  # noqa: BLE001
        return university, [], f"{type(error).__name__}: {error}"


def verify_official_names(units: list[dict], profiles: list[dict], workers: int) -> dict:
    profile_by_name = {str(profile.get("u")): profile for profile in profiles}
    candidates: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for unit in units:
        candidates[unit["u"]].append((unit["id"], unit["department"]))

    payloads = []
    skipped = []
    for university, rows in candidates.items():
        profile = profile_by_name.get(university, {})
        source_path = profile.get("officialSourcePath")
        if not source_path or not Path(source_path).exists():
            skipped.append(university)
            continue
        payloads.append((university, str(source_path), rows))

    matched_ids: set[int] = set()
    errors: dict[str, str] = {}
    if payloads:
        with ProcessPoolExecutor(max_workers=max(1, workers)) as executor:
            futures = {executor.submit(official_name_worker, payload): payload[0] for payload in payloads}
            for index, future in enumerate(as_completed(futures), 1):
                university, matched, error = future.result()
                matched_ids.update(matched)
                if error:
                    errors[university] = error
                if index % 25 == 0 or index == len(futures):
                    print(f"대학 공식 모집요강 모집단위 {index}/{len(futures)} 확인", flush=True)

    for unit in units:
        unit["officialNameConfirmed"] = unit["id"] in matched_ids
        unit["displayConfirmed"] = bool(
            unit["officialNameConfirmed"] or unit["historicalNameConfirmed"]
        )
    return {
        "officialProfilesChecked": len(payloads),
        "officialProfilesSkipped": skipped,
        "officialExtractionErrors": errors,
        "officialNameConfirmed": len(matched_ids),
    }


def attach_directory(
    profiles: list[dict], directory: dict[str, dict[str, str]]
) -> tuple[int, list[str], list[str]]:
    index = profile_index(profiles)
    matched_profiles: set[str] = set()
    unmatched_labels: list[str] = []
    conflicts: list[str] = []
    entries_by_profile: dict[str, list[dict[str, str]]] = defaultdict(list)
    for profile in profiles:
        profile.pop("sourceLinks2027", None)
        profile.pop("prospectusUrl2027", None)
        profile.pop("adiga2027Url", None)
    for label, links in directory.items():
        profile = find_profile(label, profiles, index, PDF_ALIASES)
        if not profile:
            unmatched_labels.append(label)
            continue
        matched_profiles.add(str(profile["u"]))
        entry = {"label": label, **links}
        if entry not in entries_by_profile[str(profile["u"])]:
            entries_by_profile[str(profile["u"])].append(entry)
        if not profile.get("admission") and links.get("admissionUrl"):
            profile["admission"] = links["admissionUrl"]
        profile["sourceDirectoryDate"] = SOURCE_DATE
    for profile in profiles:
        entries = entries_by_profile.get(str(profile.get("u")), [])
        if not entries:
            continue
        profile["sourceLinks2027"] = entries
        prospectuses = {entry["prospectusUrl2027"] for entry in entries if entry.get("prospectusUrl2027")}
        adiga_pages = {entry["adiga2027Url"] for entry in entries if entry.get("adiga2027Url")}
        if len(prospectuses) == 1:
            profile["prospectusUrl2027"] = next(iter(prospectuses))
        if len(adiga_pages) == 1:
            profile["adiga2027Url"] = next(iter(adiga_pages))
    return len(matched_profiles), sorted(unmatched_labels), conflicts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-official-text", action="store_true")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    logging.getLogger("pypdf").setLevel(logging.ERROR)
    if not HTML_SOURCE.exists() or not PDF_SOURCE.exists():
        raise SystemExit("첨부 원본 파일을 찾지 못했습니다.")

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    existing_official_matches = {
        (
            unit.get("u"),
            unit.get("examName"),
            unit.get("admissionGroup"),
            unit.get("department"),
            unit.get("quota"),
            tuple(unit.get("sourceRows") or []),
        ): bool(unit.get("officialNameConfirmed"))
        for unit in data.get("units2027", [])
    }
    source_rows = extract_html_rows(HTML_SOURCE)
    units, unmatched_source_universities, excluded = build_units(
        source_rows, data["profiles"], data["scores"]
    )
    if unmatched_source_universities:
        raise SystemExit(
            "첨부 HTML 대학 미연결: " + ", ".join(unmatched_source_universities)
        )

    verification = {
        "officialProfilesChecked": 0,
        "officialProfilesSkipped": [],
        "officialExtractionErrors": {},
        "officialNameConfirmed": 0,
    }
    if args.skip_official_text:
        for unit in units:
            key = (
                unit.get("u"),
                unit.get("examName"),
                unit.get("admissionGroup"),
                unit.get("department"),
                unit.get("quota"),
                tuple(unit.get("sourceRows") or []),
            )
            unit["officialNameConfirmed"] = existing_official_matches.get(key, False)
            unit["displayConfirmed"] = bool(
                unit["officialNameConfirmed"] or unit["historicalNameConfirmed"]
            )
        profile_by_name = {
            str(profile.get("u")): profile for profile in data.get("profiles", [])
        }
        verification = {
            "reusedOfficialNameAudit": True,
            "officialProfilesChecked": len(
                {
                    str(unit.get("u"))
                    for unit in units
                    if profile_by_name.get(str(unit.get("u")), {}).get(
                        "officialSourcePath"
                    )
                }
            ),
            "officialProfilesSkipped": [],
            "officialExtractionErrors": {},
            "officialNameConfirmed": sum(
                bool(unit.get("officialNameConfirmed")) for unit in units
            ),
        }
    else:
        verification = verify_official_names(units, data["profiles"], args.workers)

    directory = extract_pdf_directory(PDF_SOURCE)
    matched_directory_profiles, unmatched_directory_labels, directory_conflicts = attach_directory(
        data["profiles"], directory
    )

    data["units2027"] = units
    data.setdefault("summary", {})["unitRows2027"] = len(units)
    data["summary"]["unitRows2027Confirmed"] = sum(
        bool(unit.get("displayConfirmed")) for unit in units
    )
    data["sourceSupplement2027"] = {
        "unitSource": HTML_SOURCE.name,
        "unitSourceSha256": sha256(HTML_SOURCE),
        "directorySource": PDF_SOURCE.name,
        "directorySourceSha256": sha256(PDF_SOURCE),
        "directoryAsOf": SOURCE_DATE,
        "rawRows": len(source_rows),
        "logicalRows": len(units),
    }
    source_names = {source.get("name") for source in data.get("sources", [])}
    additions = []
    if HTML_SOURCE.name not in source_names:
        additions.append(
            {
                "name": HTML_SOURCE.name,
                "organization": "영덕고 김형진",
                "local": True,
            }
        )
    if PDF_SOURCE.name not in source_names:
        additions.append(
            {
                "name": PDF_SOURCE.name,
                "organization": "경기도교육청 진학지도리더교사 콘텐츠팀",
                "local": True,
            }
        )
    data["sources"] = [*data.get("sources", []), *additions]

    unsafe_counts = {
        "studentRecordColumnsIgnored": len(source_rows),
        "ratioRowsIgnored": sum(
            any(row.get(key) not in (None, "", "자료 미기재") for key in ("국어 비율", "수학 비율", "영어 비율", "탐구 비율"))
            for row in source_rows
        ),
        "historyRequiredOnlyIgnored": sum(row.get("한국사 반영") == "필수응시" for row in source_rows),
        "stageDuplicatesMerged": len(source_rows) - len(units) - excluded,
    }
    audit = {
        "htmlSource": str(HTML_SOURCE),
        "htmlSha256": sha256(HTML_SOURCE),
        "pdfSource": str(PDF_SOURCE),
        "pdfSha256": sha256(PDF_SOURCE),
        "rawHtmlRows": len(source_rows),
        "logicalUnitRows": len(units),
        "universities": len({unit["u"] for unit in units}),
        "excludedSpecialAdmissionRows": excluded,
        "historicalNameConfirmed": sum(unit["historicalNameConfirmed"] for unit in units),
        "displayConfirmed": sum(unit.get("displayConfirmed", False) for unit in units),
        "unconfirmed": sum(not unit.get("displayConfirmed", False) for unit in units),
        "unconfirmedSample": [
            {
                "u": unit["u"],
                "examName": unit["examName"],
                "admissionGroup": unit["admissionGroup"],
                "department": unit["department"],
                "sourceRows": unit["sourceRows"],
            }
            for unit in units
            if not unit.get("displayConfirmed", False)
        ][:100],
        "verification": verification,
        "directoryLabels": len(directory),
        "directoryProfilesMatched": matched_directory_profiles,
        "directoryLabelsUnmatched": unmatched_directory_labels,
        "directoryConflicts": directory_conflicts,
        "directoryLinks": dict(
            Counter(key for links in directory.values() for key in links)
        ),
        "ignoredUnsafeFields": unsafe_counts,
    }
    AUDIT_PATH.parent.mkdir(parents=True, exist_ok=True)
    AUDIT_PATH.write_text(
        json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
