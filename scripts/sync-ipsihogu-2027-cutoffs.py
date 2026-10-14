from __future__ import annotations

import gzip
import hashlib
import json
import math
import re
import ssl
import time
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "ipsihogu-2027-cutoffs-summary.json"

SOURCE_PAGE_URL = "https://ipsihogu.com/2027-jungsi-calculator/"
SOURCE_JSON_URL = (
    "https://ipsihogu.com/wp-content/uploads/2026/08/calcul_db_.json"
)
EXPECTED_ROW_COUNT = 5_339
EXPECTED_UNIVERSITY_COUNT = 167
DETAIL_PAGE_WORKERS = 4
SOURCE_KIND = "forecast"
CUTOFF_BASIS = "2027 자체 예상컷(100점 정규화)"
FORECAST_PERCENTILE_BASIS = (
    "2027 예상 백분위 컷(2026 실측 기반, 추가합격 고려)"
)

# 외부 표기와 현재 프로젝트 표기가 다른 경우만 명시적으로 연결한다.
# 캠퍼스 표기를 지운 뒤 자동 합치는 방식은 사용하지 않는다.
UNIVERSITY_ALIASES = {
    "강원대(삼척)": "강원대",
    "건국대(글로컬)": "건국대(글)",
    "경북대(상주)": "경북대",
    "국립강릉원주대": "강원대(강릉원주대)",
    "국립공주대": "공주대",
    "국립한국교통대": "한국교통대",
    "중앙대(다빈치)": "중앙대",
    "한국기술교대": "한국기술교육대",
    "한국외대": "한국외국어대",
    "한국체대": "한국체육대",
}

# 하나의 프로젝트 대학명 아래 여러 캠퍼스가 함께 있는 경우에만 사용한다.
# 원문의 캠퍼스 표기가 명확한 행을 다른 캠퍼스 모집단위에 연결하지 않는다.
SOURCE_CAMPUS_FILTERS = {
    "강원대": {"춘천"},
    "강원대(삼척)": {"삼척"},
}

GROUP_FIELDS = (
    "admissionGroup",
    "admission_group",
    "group",
    "gun",
    "모집군",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def compact(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip().lower()
    return re.sub(r"[^0-9a-z가-힣]", "", text)


def normalize_university(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    text = text.replace("대학교", "대").replace("대학", "대")
    text = text.replace("(서울)", "").replace("(본교)", "")
    return compact(text)


def normalize_department(value: object) -> str:
    return compact(value)


def normalize_exam(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    text = re.sub(r"[()\[\]{}]", "", text)
    text = re.sub(r"전형$", "", text)
    return compact(text)


def normalize_group(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    if re.search(r"(^|[^가-힣])가(?:군)?($|[^가-힣])", text) or text in {
        "가",
        "가군",
    }:
        return "가군"
    if re.search(r"(^|[^가-힣])나(?:군)?($|[^가-힣])", text) or text in {
        "나",
        "나군",
    }:
        return "나군"
    if re.search(r"(^|[^가-힣])다(?:군)?($|[^가-힣])", text) or text in {
        "다",
        "다군",
    }:
        return "다군"
    return ""


def source_group(row: dict[str, Any]) -> str:
    for field in GROUP_FIELDS:
        if field in row and row.get(field) not in (None, ""):
            return normalize_group(row.get(field))
    return ""


def canonical_json(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def to_number(value: object, *, row_number: int, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise RuntimeError(f"{row_number}행 {field} 값이 숫자가 아닙니다: {value!r}")
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise RuntimeError(
            f"{row_number}행 {field} 값을 숫자로 바꿀 수 없습니다: {value!r}"
        ) from error
    if not math.isfinite(number) or not 0 <= number <= 100:
        raise RuntimeError(
            f"{row_number}행 {field} 값이 0~100 범위를 벗어났습니다: {value!r}"
        )
    return number


def fetch_source() -> tuple[bytes, list[dict[str, Any]]]:
    request = urllib.request.Request(
        SOURCE_JSON_URL,
        headers={
            "Accept": "application/json,text/plain,*/*",
            "Referer": SOURCE_PAGE_URL,
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/140 Safari/537.36"
            ),
        },
    )
    last_error: Exception | None = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(
                request,
                timeout=60,
                context=ssl.create_default_context(),
            ) as response:
                if response.status != 200:
                    raise RuntimeError(f"원문 JSON 응답 코드가 {response.status}입니다.")
                payload = response.read()
                if response.headers.get("Content-Encoding", "").lower() == "gzip":
                    payload = gzip.decompress(payload)
            parsed = json.loads(payload.decode("utf-8-sig"))
            if not isinstance(parsed, list):
                raise RuntimeError("원문 JSON의 최상위 값이 배열이 아닙니다.")
            if any(not isinstance(row, dict) for row in parsed):
                raise RuntimeError("원문 JSON에 객체가 아닌 행이 있습니다.")
            return payload, parsed
        except (
            OSError,
            UnicodeError,
            json.JSONDecodeError,
            urllib.error.URLError,
        ) as error:
            last_error = error
            if attempt < 4:
                time.sleep(min(2**attempt, 8))
    raise RuntimeError(f"원문 JSON 수집에 실패했습니다: {last_error}") from last_error


def fetch_page_bytes(url: str, *, referer: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            "Referer": referer,
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/140 Safari/537.36"
            ),
        },
    )
    last_error: Exception | None = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(
                request,
                timeout=90,
                context=ssl.create_default_context(),
            ) as response:
                if response.status != 200:
                    raise RuntimeError(f"응답 코드 {response.status}")
                payload = response.read()
                if response.headers.get("Content-Encoding", "").lower() == "gzip":
                    payload = gzip.decompress(payload)
                return payload
        except (OSError, RuntimeError, urllib.error.URLError) as error:
            last_error = error
            if attempt < 4:
                time.sleep(min(2**attempt, 8))
    raise RuntimeError(f"페이지 수집 실패: {url}: {last_error}") from last_error


def extract_json_assignment(page: str, variable: str) -> object:
    match = re.search(
        rf"\b(?:const|let|var)\s+{re.escape(variable)}\s*=\s*",
        page,
    )
    if not match:
        raise RuntimeError(f"페이지에서 {variable} 선언을 찾지 못했습니다.")
    value_text = page[match.end() :].lstrip()
    try:
        value, _ = json.JSONDecoder().raw_decode(value_text)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"{variable} JSON 파싱에 실패했습니다: {error}") from error
    return value


def verify_detail_pages(source_rows: list[dict[str, Any]]) -> dict[str, Any]:
    landing_payload = fetch_page_bytes(SOURCE_PAGE_URL, referer=SOURCE_PAGE_URL)
    try:
        landing_page = landing_payload.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise RuntimeError("계산기 첫 화면을 UTF-8로 읽지 못했습니다.") from error
    detail_urls = extract_json_assignment(landing_page, "UNI_DETAIL_URLS")
    if not isinstance(detail_urls, dict):
        raise RuntimeError("UNI_DETAIL_URLS가 객체가 아닙니다.")
    if len(detail_urls) != EXPECTED_UNIVERSITY_COUNT:
        raise RuntimeError(
            "상세 페이지 URL 수가 기준과 다릅니다: "
            f"기준 {EXPECTED_UNIVERSITY_COUNT}, 수집 {len(detail_urls)}"
        )
    if len(set(detail_urls.values())) != len(detail_urls):
        raise RuntimeError("UNI_DETAIL_URLS에 중복 URL이 있습니다.")

    central_by_university: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in source_rows:
        central_by_university[str(row.get("uni") or "").strip()].append(row)
    central_universities = set(central_by_university)
    detail_universities = set(map(str, detail_urls))
    if central_universities != detail_universities:
        missing_pages = sorted(central_universities - detail_universities)
        unexpected_pages = sorted(detail_universities - central_universities)
        raise RuntimeError(
            "중앙 JSON 대학과 상세 URL 대학이 일치하지 않습니다: "
            f"누락={missing_pages}, 추가={unexpected_pages}"
        )

    failures: list[dict[str, object]] = []
    verified: dict[str, dict[str, Any]] = {}

    def inspect(university: str, url: str) -> dict[str, Any]:
        payload = fetch_page_bytes(str(url), referer=SOURCE_PAGE_URL)
        try:
            page = payload.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise RuntimeError("상세 페이지를 UTF-8로 읽지 못했습니다.") from error
        detail_rows = extract_json_assignment(page, "UNIV_DATA")
        if not isinstance(detail_rows, list) or any(
            not isinstance(row, dict) for row in detail_rows
        ):
            raise RuntimeError("UNIV_DATA가 객체 배열이 아닙니다.")
        wrong_universities = sorted(
            {
                str(row.get("uni") or "").strip()
                for row in detail_rows
                if str(row.get("uni") or "").strip() != university
            }
        )
        if wrong_universities:
            raise RuntimeError(
                f"UNIV_DATA 대학명이 URL 키와 다릅니다: {wrong_universities}"
            )

        central_rows = central_by_university[university]
        detail_counter = Counter(canonical_json(row) for row in detail_rows)
        central_counter = Counter(canonical_json(row) for row in central_rows)
        if detail_counter != central_counter:
            missing_rows = sum((central_counter - detail_counter).values())
            extra_rows = sum((detail_counter - central_counter).values())
            raise RuntimeError(
                "중앙 JSON과 상세 페이지 행 집합이 다릅니다: "
                f"중앙={len(central_rows)}, 상세={len(detail_rows)}, "
                f"상세 누락={missing_rows}, 상세 추가={extra_rows}"
            )
        canonical_rows = sorted(detail_counter.elements())
        return {
            "university": university,
            "url": str(url),
            "rows": len(detail_rows),
            "univDataSha256": sha256_bytes(
                ("\n".join(canonical_rows)).encode("utf-8")
            ),
        }

    with ThreadPoolExecutor(max_workers=DETAIL_PAGE_WORKERS) as executor:
        futures = {
            executor.submit(inspect, str(university), str(url)): str(university)
            for university, url in detail_urls.items()
        }
        for future in as_completed(futures):
            university = futures[future]
            try:
                verified[university] = future.result()
            except Exception as error:
                failures.append(
                    {
                        "university": university,
                        "url": str(detail_urls[university]),
                        "error": str(error),
                    }
                )

    pages = [verified[name] for name in sorted(verified)]
    detail_rows_total = sum(page["rows"] for page in pages)
    detail_pages_verified = len(pages)
    central_json_matches = (
        not failures
        and detail_pages_verified == EXPECTED_UNIVERSITY_COUNT
        and detail_rows_total == len(source_rows)
    )
    result = {
        "detailPagesExpected": EXPECTED_UNIVERSITY_COUNT,
        "detailPagesVerified": detail_pages_verified,
        "failures": sorted(failures, key=lambda item: str(item["university"])),
        "detailRows": detail_rows_total,
        "centralJsonMatches": central_json_matches,
        "detailUrlMapSha256": sha256_bytes(
            canonical_json(detail_urls).encode("utf-8")
        ),
        "pages": pages,
    }
    if not central_json_matches:
        failure_summary = "; ".join(
            f"{item['university']}: {item['error']}" for item in failures
        )
        raise RuntimeError(
            "상세 페이지 전수 대조에 실패했습니다: "
            f"검증={detail_pages_verified}/{EXPECTED_UNIVERSITY_COUNT}, "
            f"상세행={detail_rows_total}/{len(source_rows)}, "
            f"실패={len(failures)}; {failure_summary}"
        )
    return result


def university_index(units: list[dict[str, Any]]) -> dict[str, list[str]]:
    index: dict[str, list[str]] = defaultdict(list)
    for name in sorted({str(unit.get("u") or "").strip() for unit in units}):
        key = normalize_university(name)
        if name and name not in index[key]:
            index[key].append(name)
    return index


def resolve_university(
    source_name: str,
    local_names: set[str],
    normalized_index: dict[str, list[str]],
) -> tuple[str, str]:
    alias = UNIVERSITY_ALIASES.get(source_name)
    if alias:
        if alias in local_names:
            return alias, "explicit-alias"
        return alias, "alias-not-in-units2027"
    if source_name in local_names:
        return source_name, "exact"
    matches = normalized_index.get(normalize_university(source_name), [])
    if len(matches) == 1:
        return matches[0], "normalized-exact"
    if len(matches) > 1:
        return "", "ambiguous-university-name"
    return "", "university-not-in-units2027"


def write_json_atomic(path: Path, value: object, *, compact_output: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    if compact_output:
        content = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    else:
        content = json.dumps(value, ensure_ascii=False, indent=2)
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def main() -> None:
    if not DATA_PATH.exists():
        raise RuntimeError(f"프로젝트 데이터 파일이 없습니다: {DATA_PATH}")

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    units = data.get("units2027")
    if not isinstance(units, list) or not units:
        raise RuntimeError("admissions-data.json의 units2027이 비어 있습니다.")

    payload, source_rows = fetch_source()
    source_sha256 = sha256_bytes(payload)
    if len(source_rows) != EXPECTED_ROW_COUNT:
        raise RuntimeError(
            "원문 행수가 기준과 달라 자동 반영을 중단합니다: "
            f"기준 {EXPECTED_ROW_COUNT}, 수집 {len(source_rows)}"
        )

    source_universities = sorted(
        {str(row.get("uni") or "").strip() for row in source_rows}
    )
    if len(source_universities) != EXPECTED_UNIVERSITY_COUNT:
        raise RuntimeError(
            "원문 대학 수가 기준과 달라 자동 반영을 중단합니다: "
            f"기준 {EXPECTED_UNIVERSITY_COUNT}, 수집 {len(source_universities)}"
        )

    detail_verification = verify_detail_pages(source_rows)

    missing_essential: list[dict[str, object]] = []
    range_violations: list[dict[str, object]] = []
    for row_number, row in enumerate(source_rows, start=1):
        if not str(row.get("uni") or "").strip() or not str(
            row.get("dept") or ""
        ).strip():
            missing_essential.append(
                {
                    "sourceRowNumber": row_number,
                    "university": row.get("uni"),
                    "department": row.get("dept"),
                }
            )
        for field in ("cutoffIncluded", "cutoffExcluded"):
            value = row.get(field)
            if value is None and field == "cutoffExcluded":
                continue
            try:
                to_number(value, row_number=row_number, field=field)
            except RuntimeError as error:
                range_violations.append(
                    {
                        "sourceRowNumber": row_number,
                        "field": field,
                        "value": value,
                        "error": str(error),
                    }
                )
    if missing_essential:
        raise RuntimeError(
            f"대학명 또는 모집단위가 비어 있는 행이 {len(missing_essential)}개입니다."
        )
    if range_violations:
        raise RuntimeError(
            f"예상 백분위 범위 위반이 {len(range_violations)}개입니다."
        )

    local_names = {str(unit.get("u") or "").strip() for unit in units}
    normalized_university_index = university_index(units)
    units_by_university: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for unit in units:
        units_by_university[str(unit.get("u") or "").strip()].append(unit)

    row_canonical = [canonical_json(row) for row in source_rows]
    canonical_hashes = [
        hashlib.sha256(value.encode("utf-8")).hexdigest() for value in row_canonical
    ]
    exact_counts = Counter(canonical_hashes)
    exact_seen: Counter[str] = Counter()

    conflict_groups: dict[tuple[str, str, str, str, str], list[int]] = defaultdict(
        list
    )
    conflict_values: dict[
        tuple[str, str, str, str, str], set[tuple[float, float | None]]
    ] = defaultdict(set)
    for row_number, row in enumerate(source_rows, start=1):
        key = (
            normalize_university(row.get("uni")),
            normalize_department(row.get("dept")),
            normalize_exam(row.get("type")),
            compact(row.get("code")),
            source_group(row),
        )
        included = to_number(
            row.get("cutoffIncluded"),
            row_number=row_number,
            field="cutoffIncluded",
        )
        excluded_raw = row.get("cutoffExcluded")
        excluded = (
            None
            if excluded_raw is None
            else to_number(
                excluded_raw,
                row_number=row_number,
                field="cutoffExcluded",
            )
        )
        conflict_groups[key].append(row_number)
        conflict_values[key].add((included, excluded))
    conflicting_keys = {
        key for key, values in conflict_values.items() if len(values) > 1
    }

    old_meta = data.get("cutoffs2027Meta")
    if isinstance(old_meta, dict) and old_meta.get("rawSha256") == source_sha256:
        retrieved_at = str(old_meta.get("retrievedAt") or utc_now())
    else:
        retrieved_at = utc_now()

    cutoffs: list[dict[str, Any]] = []
    quarantine_reason_counts: Counter[str] = Counter()
    resolution_counts: Counter[str] = Counter()
    coverage_by_university: dict[str, dict[str, Any]] = {}
    source_department_keys: set[tuple[str, str]] = set()
    resolved_department_keys: set[tuple[str, str]] = set()
    duplicate_record_ids: set[str] = set()
    generated_record_ids: set[str] = set()

    for row_number, row in enumerate(source_rows, start=1):
        source_uni = str(row.get("uni") or "").strip()
        department = str(row.get("dept") or "").strip()
        source_exam = str(row.get("type") or "").strip()
        source_code = str(row.get("code") or "").strip()
        group = source_group(row)
        included = to_number(
            row.get("cutoffIncluded"),
            row_number=row_number,
            field="cutoffIncluded",
        )
        excluded_raw = row.get("cutoffExcluded")
        excluded = (
            None
            if excluded_raw is None
            else to_number(
                excluded_raw,
                row_number=row_number,
                field="cutoffExcluded",
            )
        )

        record_hash = canonical_hashes[row_number - 1]
        exact_seen[record_hash] += 1
        source_record_id = (
            f"ipsihogu-2027-{record_hash[:20]}-{exact_seen[record_hash]:02d}"
        )
        if source_record_id in generated_record_ids:
            duplicate_record_ids.add(source_record_id)
        generated_record_ids.add(source_record_id)

        canonical_uni, university_resolution = resolve_university(
            source_uni,
            local_names,
            normalized_university_index,
        )
        resolution_counts[university_resolution] += 1
        local_university_units = units_by_university.get(canonical_uni, [])
        campus_filter = SOURCE_CAMPUS_FILTERS.get(source_uni)
        if campus_filter:
            local_university_units = [
                unit
                for unit in local_university_units
                if str(unit.get("campus") or "").strip() in campus_filter
            ]
        unconfirmed_university_units = [
            unit
            for unit in local_university_units
            if unit.get("displayConfirmed") is not True
        ]
        local_university_units = [
            unit
            for unit in local_university_units
            if unit.get("displayConfirmed") is True
        ]
        department_candidates = [
            unit
            for unit in local_university_units
            if normalize_department(unit.get("department"))
            == normalize_department(department)
        ]
        unconfirmed_department_candidates = [
            unit
            for unit in unconfirmed_university_units
            if normalize_department(unit.get("department"))
            == normalize_department(department)
        ]
        exam_key = normalize_exam(source_exam)
        exam_candidates = (
            [
                unit
                for unit in department_candidates
                if normalize_exam(unit.get("examName")) == exam_key
            ]
            if exam_key
            else list(department_candidates)
        )
        unconfirmed_exam_candidates = (
            [
                unit
                for unit in unconfirmed_department_candidates
                if normalize_exam(unit.get("examName")) == exam_key
            ]
            if exam_key
            else list(unconfirmed_department_candidates)
        )
        # 원문에는 현재 모집군 필드가 없다. 이 경우에도 대학+모집단위+전형으로
        # 현지 후보가 정확히 1개일 때만 그 후보의 모집군을 채택한다. 후보가 여러
        # 군 또는 캠퍼스에 걸치면 len(group_candidates) > 1이 되어 격리된다.
        group_candidates = (
            [
                unit
                for unit in exam_candidates
                if normalize_group(unit.get("admissionGroup")) == group
            ]
            if group
            else list(exam_candidates)
        )

        source_department_keys.add((source_uni, department))
        if department_candidates:
            resolved_department_keys.add((source_uni, department))

        reasons: list[str] = []
        if university_resolution in {
            "alias-not-in-units2027",
            "ambiguous-university-name",
            "university-not-in-units2027",
        }:
            reasons.append(university_resolution)
        elif not department_candidates:
            reasons.append(
                "local-unit-not-display-confirmed"
                if unconfirmed_exam_candidates
                else "department-not-in-units2027"
            )
        elif exam_key and not exam_candidates:
            reasons.append(
                "local-unit-not-display-confirmed"
                if unconfirmed_exam_candidates
                else "exam-type-not-in-units2027"
            )
        if group and exam_candidates and not group_candidates:
            reasons.append("admission-group-not-in-units2027")
        if str(row.get("scale") or "").strip() != "백/백":
            reasons.append("non-percentile-source-scale")

        conflict_key = (
            normalize_university(source_uni),
            normalize_department(department),
            exam_key,
            compact(source_code),
            group,
        )
        if conflict_key in conflicting_keys:
            reasons.append("conflicting-source-cutoffs")
        if exact_counts[record_hash] > 1 and exact_seen[record_hash] > 1:
            reasons.append("exact-source-duplicate")
        if len(group_candidates) > 1:
            reasons.append("multiple-local-unit-candidates")

        reasons = list(dict.fromkeys(reasons))
        matched = not reasons and len(group_candidates) == 1
        if not matched and not reasons:
            reasons.append("no-single-local-unit-candidate")
        for reason in reasons:
            quarantine_reason_counts[reason] += 1

        matched_unit = group_candidates[0] if matched else None
        record = {
            "sourceRecordId": source_record_id,
            "sourceRowNumber": row_number,
            "sourceCanonicalHash": record_hash,
            "sourceKind": SOURCE_KIND,
            "cutoffBasis": CUTOFF_BASIS,
            "sourceUniversity": source_uni,
            "u": canonical_uni or source_uni,
            "department": department,
            "sourceExamType": source_exam,
            "sourceCode": source_code,
            "sourceAdmissionGroup": group or None,
            "sourceRegion": row.get("region"),
            "sourceTrack": row.get("gyeyeol"),
            "sourceSubcategory": row.get("subcat"),
            "sourceScale": row.get("scale"),
            "englishMethod": row.get("engMethod"),
            "englishNormalizationNote": row.get("engFillNote"),
            "approximate": row.get("engMethod") in {"감점", "가산점"},
            "cutoffScore100": included,
            "cutoffScore100ExcludingEnglish": excluded,
            "matchStatus": "matched" if matched else "quarantined",
            "quarantineReasons": [] if matched else reasons,
            "matchedUnitId": matched_unit.get("id") if matched_unit else None,
            "matchedAdmissionGroup": (
                matched_unit.get("admissionGroup") if matched_unit else None
            ),
            "candidateCount": len(group_candidates),
        }
        if matched:
            record["forecastPercentile"] = included
            record["forecastPercentileExcludingEnglish"] = excluded
            record["forecastPercentileBasis"] = FORECAST_PERCENTILE_BASIS
        cutoffs.append(record)

        university_entry = coverage_by_university.setdefault(
            source_uni,
            {
                "sourceUniversity": source_uni,
                "canonicalUniversity": canonical_uni or None,
                "universityResolution": university_resolution,
                "sourceRows": 0,
                "sourceDepartments": set(),
                "departmentRowsResolved": 0,
                "examRowsResolved": 0,
                "rowsWithSourceGroup": 0,
                "matchedRows": 0,
                "quarantinedRows": 0,
            },
        )
        university_entry["sourceRows"] += 1
        university_entry["sourceDepartments"].add(department)
        university_entry["departmentRowsResolved"] += bool(department_candidates)
        university_entry["examRowsResolved"] += bool(exam_candidates)
        university_entry["rowsWithSourceGroup"] += bool(group)
        university_entry["matchedRows"] += matched
        university_entry["quarantinedRows"] += not matched

    if duplicate_record_ids:
        raise RuntimeError(
            "생성된 sourceRecordId가 중복되었습니다: "
            + ", ".join(sorted(duplicate_record_ids)[:10])
        )
    if len(cutoffs) != EXPECTED_ROW_COUNT:
        raise RuntimeError(
            f"변환 행수 불일치: 원문 {EXPECTED_ROW_COUNT}, 변환 {len(cutoffs)}"
        )

    by_university = []
    for source_uni in source_universities:
        entry = dict(coverage_by_university[source_uni])
        entry["sourceDepartmentCount"] = len(entry.pop("sourceDepartments"))
        by_university.append(entry)

    exact_duplicate_groups = [
        (record_hash, count)
        for record_hash, count in exact_counts.items()
        if count > 1
    ]
    conflict_samples = []
    for key in sorted(conflicting_keys)[:100]:
        rows = conflict_groups[key]
        values = sorted(conflict_values[key], key=lambda item: (item[0], item[1] or -1))
        conflict_samples.append(
            {
                "sourceUniversityKey": key[0],
                "departmentKey": key[1],
                "examKey": key[2],
                "sourceCodeKey": key[3],
                "sourceAdmissionGroup": key[4] or None,
                "sourceRowNumbers": rows,
                "cutoffPairs": [
                    {
                        "score100Included": included,
                        "score100Excluded": excluded,
                    }
                    for included, excluded in values
                ],
            }
        )

    matched_count = sum(row["matchStatus"] == "matched" for row in cutoffs)
    quarantined_count = len(cutoffs) - matched_count
    matched_unit_ids = [
        row["matchedUnitId"]
        for row in cutoffs
        if row["matchStatus"] == "matched"
    ]
    duplicate_matched_unit_ids = [
        unit_id
        for unit_id, count in Counter(matched_unit_ids).items()
        if count > 1
    ]
    if duplicate_matched_unit_ids:
        raise RuntimeError(
            "하나의 현지 모집단위에 예상컷이 중복 연결되었습니다: "
            + ", ".join(map(str, duplicate_matched_unit_ids[:20]))
        )
    invalid_matched_scales = [
        row["sourceRecordId"]
        for row in cutoffs
        if row["matchStatus"] == "matched" and row["sourceScale"] != "백/백"
    ]
    if invalid_matched_scales:
        raise RuntimeError(
            "백/백 이외 지표가 forecastPercentile로 연결되었습니다: "
            + ", ".join(invalid_matched_scales[:20])
        )
    source_meta = {
        "sourcePageUrl": SOURCE_PAGE_URL,
        "rawUrl": SOURCE_JSON_URL,
        "rawSha256": source_sha256,
        "retrievedAt": retrieved_at,
        "sourceKind": SOURCE_KIND,
        "cutoffBasis": CUTOFF_BASIS,
        "forecastPercentileBasis": FORECAST_PERCENTILE_BASIS,
        "rawRows": len(source_rows),
        "sourceUniversities": len(source_universities),
        "matchedRows": matched_count,
        "quarantinedRows": quarantined_count,
        "publishedRows": matched_count,
        "uiEligibleMatchStatus": "matched",
    }

    audit = {
        "status": "PASS",
        "source": source_meta,
        "scope": {
            "expectedRows": EXPECTED_ROW_COUNT,
            "observedRows": len(source_rows),
            "allSourceRowsExplored": len(source_rows) == EXPECTED_ROW_COUNT,
            "expectedUniversities": EXPECTED_UNIVERSITY_COUNT,
            "observedUniversities": len(source_universities),
            "allSourceUniversitiesExplored": (
                len(source_universities) == EXPECTED_UNIVERSITY_COUNT
            ),
            "detailPagesExpected": detail_verification[
                "detailPagesExpected"
            ],
            "detailPagesVerified": detail_verification[
                "detailPagesVerified"
            ],
            "detailRows": detail_verification["detailRows"],
        },
        "validations": {
            "networkFetch": "pass",
            "jsonArray": "pass",
            "rowCount": "pass",
            "universityCount": "pass",
            "missingEssentialFields": 0,
            "rangeViolations": 0,
            "duplicateSourceRecordIds": 0,
            "detailPagesExpected": detail_verification[
                "detailPagesExpected"
            ],
            "detailPagesVerified": detail_verification[
                "detailPagesVerified"
            ],
            "failures": detail_verification["failures"],
            "detailRows": detail_verification["detailRows"],
            "centralJsonMatches": detail_verification[
                "centralJsonMatches"
            ],
        },
        "detailVerification": detail_verification,
        "duplicates": {
            "exactDuplicateGroups": len(exact_duplicate_groups),
            "exactDuplicateRows": sum(count for _, count in exact_duplicate_groups),
            "exactDuplicateExcessRows": sum(
                count - 1 for _, count in exact_duplicate_groups
            ),
            "exactDuplicateSample": [
                {"sourceCanonicalHash": record_hash, "rows": count}
                for record_hash, count in exact_duplicate_groups[:100]
            ],
            "conflictingKeyGroups": len(conflicting_keys),
            "conflictingRows": sum(
                len(conflict_groups[key]) for key in conflicting_keys
            ),
            "conflictingKeySample": conflict_samples,
        },
        "quality": {
            "sourceScale": dict(
                sorted(Counter(str(row.get("scale")) for row in source_rows).items())
            ),
            "englishMethod": dict(
                sorted(
                    Counter(str(row.get("engMethod")) for row in source_rows).items()
                )
            ),
            "englishNormalizationNote": dict(
                sorted(
                    Counter(
                        str(row.get("engFillNote")) for row in source_rows
                    ).items()
                )
            ),
            "matchedSourceScale": dict(
                sorted(
                    Counter(
                        str(row.get("sourceScale"))
                        for row in cutoffs
                        if row["matchStatus"] == "matched"
                    ).items()
                )
            ),
            "matchedEnglishMethod": dict(
                sorted(
                    Counter(
                        str(row.get("englishMethod"))
                        for row in cutoffs
                        if row["matchStatus"] == "matched"
                    ).items()
                )
            ),
            "matchedEnglishNormalizationNote": dict(
                sorted(
                    Counter(
                        str(row.get("englishNormalizationNote"))
                        for row in cutoffs
                        if row["matchStatus"] == "matched"
                    ).items()
                )
            ),
            "matchedApproximateRows": sum(
                row["matchStatus"] == "matched" and bool(row["approximate"])
                for row in cutoffs
            ),
        },
        "coverage": {
            "localUnitRows": len(units),
            "localUnitUniversities": len(local_names),
            "sourceRows": len(source_rows),
            "sourceUniversities": len(source_universities),
            "sourceDepartmentKeys": len(source_department_keys),
            "departmentKeysResolved": len(resolved_department_keys),
            "rowsUniversityResolved": sum(
                1
                for row in cutoffs
                if row["u"] in local_names
            ),
            "rowsDepartmentResolved": sum(
                entry["departmentRowsResolved"] for entry in by_university
            ),
            "rowsExamResolved": sum(
                entry["examRowsResolved"] for entry in by_university
            ),
            "rowsWithSourceAdmissionGroup": sum(
                entry["rowsWithSourceGroup"] for entry in by_university
            ),
            "matchedWithoutSourceAdmissionGroup": sum(
                row["matchStatus"] == "matched"
                and row["sourceAdmissionGroup"] is None
                for row in cutoffs
            ),
            "matchedRows": matched_count,
            "quarantinedRows": quarantined_count,
            "universityResolution": dict(sorted(resolution_counts.items())),
            "quarantineReasons": dict(sorted(quarantine_reason_counts.items())),
            "quarantinedSample": [
                {
                    "sourceRecordId": row["sourceRecordId"],
                    "sourceRowNumber": row["sourceRowNumber"],
                    "sourceUniversity": row["sourceUniversity"],
                    "department": row["department"],
                    "sourceExamType": row["sourceExamType"],
                    "sourceCode": row["sourceCode"],
                    "sourceScale": row["sourceScale"],
                    "cutoffScore100": row["cutoffScore100"],
                    "cutoffScore100ExcludingEnglish": row[
                        "cutoffScore100ExcludingEnglish"
                    ],
                    "quarantineReasons": row["quarantineReasons"],
                }
                for row in cutoffs
                if row["matchStatus"] == "quarantined"
            ][:250],
            "byUniversity": by_university,
        },
        "safety": {
            "historicalScoresTouched": False,
            "officialP50P70Touched": False,
            "existingUnits2027Touched": False,
            "forecastValuesStoredSeparately": True,
            "uiExposureRule": (
                "admissions-data.json의 cutoffs2027에는 matched 파생행만 수록"
            ),
        },
    }

    data["cutoffs2027Meta"] = source_meta
    data["cutoffs2027"] = [
        row for row in cutoffs if row["matchStatus"] == "matched"
    ]
    write_json_atomic(DATA_PATH, data, compact_output=True)
    write_json_atomic(AUDIT_PATH, audit, compact_output=False)

    print(
        json.dumps(
            {
                "status": "PASS",
                "rawSha256": source_sha256,
                "sourceRows": len(source_rows),
                "sourceUniversities": len(source_universities),
                "matchedRows": matched_count,
                "quarantinedRows": quarantined_count,
                "exactDuplicateGroups": len(exact_duplicate_groups),
                "conflictingKeyGroups": len(conflicting_keys),
                "audit": str(AUDIT_PATH),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
