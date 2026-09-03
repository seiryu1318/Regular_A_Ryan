from __future__ import annotations

import csv
import difflib
import json
import os
import re
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
CACHE_DIR = ROOT / "audit" / "adiga-results"
REPORT_PATH = ROOT / "audit" / "official-results-audit.csv"
SUMMARY_PATH = ROOT / "audit" / "official-results-summary.json"
ENDPOINT = "https://www.adiga.kr/uct/acd/ade/criteriaAndResultItemNewAjax.do"
FIELDS = ("n", "c", "add", "cv50", "cv70", "p50", "p70")
OFFICIAL_PORTAL_EXCEPTIONS = {
    (8119, "cv70"),
    # 유원대 입학처가 2025 정시 결과를 1000점 기준으로 다시 공개했다.
    # 대학어디가의 종전 100점 입력값보다 해당 대학 최신 공식 결과를 우선한다.
    (14632, "cv70"),
    (14637, "cv70"),
    (14655, "cv70"),
}


def clean(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value or "").lower()


def admission_group(value: str) -> str:
    match = re.search(r"[가나다]", value or "")
    return match.group() if match else ""


def department_similarity(left: str, right: str) -> float:
    left_clean = clean(left)
    right_clean = clean(right)
    if left_clean == right_clean:
        return 1.0
    if min(len(left_clean), len(right_clean)) >= 4 and (left_clean in right_clean or right_clean in left_clean):
        return 0.94
    return difflib.SequenceMatcher(None, left_clean, right_clean).ratio()


def number(value: str, *, zero_is_blank: bool = False) -> float | int | None:
    text = (value or "").strip().replace(",", "").replace("%", "").replace(":1", "")
    if not text or text in {"-", "—"} or "미제출" in text:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    result = float(match.group())
    if zero_is_blank and result == 0:
        return None
    return int(result) if result.is_integer() else result


def source_pair(row: dict) -> tuple[str, str] | None:
    source = row.get("source") or ""
    code = re.search(r"unvCd=(\d+)", source)
    source_year = re.search(r"searchSyr=(\d{4})", source)
    if not code or not source_year:
        return None
    return code.group(1), source_year.group(1)


def fetch(pair: tuple[str, str]) -> tuple[tuple[str, str], str, str | None]:
    code, source_year = pair
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{source_year}-{code}.html"
    if os.environ.get("ADIGA_REFRESH") != "1" and cache.exists() and cache.stat().st_size > 300:
        return pair, cache.read_text(encoding="utf-8"), None

    payload = urllib.parse.urlencode(
        {
            "searchSyr": source_year,
            "unvCd": code,
            "tsrdCmphSlcnArtclUpCd": "40",
            "compUnvCd": "",
        }
    ).encode()
    request = urllib.request.Request(
        ENDPOINT,
        data=payload,
        headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "Mozilla/5.0 admissions-data-audit",
        },
    )
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                content = response.read().decode("utf-8")
            if len(content) <= 300:
                raise ValueError(f"빈 응답 {len(content)} bytes")
            cache.write_text(content, encoding="utf-8")
            return pair, content, None
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    return pair, "", str(last_error)


def table_label(table) -> str:
    node = table.getprevious()
    while node is not None:
        text = " ".join(node.text_content().split())
        if text:
            return text
        node = node.getprevious()
    return ""


def parse_official(content: str) -> list[dict]:
    root = html.fromstring(content)
    rows: list[dict] = []
    for table in root.xpath("//table"):
        exam = table_label(table)
        for tr in table.xpath(".//tbody/tr"):
            cells = [" ".join(cell.text_content().split()) for cell in tr.xpath("./td")]
            if len(cells) < 31:
                continue
            row = {
                "exam": exam,
                "a": cells[0],
                "d": cells[1],
                "n": number(cells[4]),
                "c": number(cells[5]),
                "add": number(cells[6]),
                "cv50": number(cells[7], zero_is_blank=True),
                "cv70": number(cells[8], zero_is_blank=True),
                "p50": number(cells[17], zero_is_blank=True),
                "p70": number(cells[28], zero_is_blank=True),
            }
            if row["c"] == 9999:
                row["c"] = None
            if row["cv50"] == 9999 and row["cv70"] == 9999:
                row["cv50"] = None
                row["cv70"] = None
                if row["p50"] == 99:
                    row["p50"] = None
                if row["p70"] == 99:
                    row["p70"] = None
            if row["cv50"] == 1 and row["cv70"] == 1:
                row["cv50"] = None
                row["cv70"] = None
                if row["p50"] == 1:
                    row["p50"] = None
                if row["p70"] == 1:
                    row["p70"] = None
            if row["p50"] == 1 and row["p70"] == 1:
                row["p50"] = None
                row["p70"] = None
            # 대학어디가 입력값 중 백분위 칸에 환산점수나 영역 합계가 들어간 사례는
            # 백분위로 비교하거나 화면에 노출할 수 없다.
            for field in ("p50", "p70"):
                if isinstance(row[field], (int, float)) and row[field] > 100:
                    row[field] = None
            rows.append(row)
    return rows


def same_number(left, right) -> bool:
    if isinstance(left, str):
        left = number(left)
    if isinstance(right, str):
        right = number(right)
    if left is None or right is None:
        return left is None and right is None
    return abs(float(left) - float(right)) <= 0.011


def official_value_available(field: str, value) -> bool:
    if value is None:
        return False
    if field in {"n", "c"} and isinstance(value, (int, float)) and value <= 0:
        return False
    return True


def candidate_cost(local: dict, official: dict) -> tuple[int, float]:
    mismatches = 0
    distance = 0.0
    for field in FIELDS:
        left = local.get(field)
        right = official.get(field)
        if not official_value_available(field, right):
            continue
        if same_number(left, right):
            continue
        mismatches += 1
        left_number = number(left) if isinstance(left, str) else left
        right_number = number(right) if isinstance(right, str) else right
        if left_number is not None and right_number is not None:
            scale = max(abs(float(left_number)), abs(float(right_number)), 1.0)
            distance += abs(float(left_number) - float(right_number)) / scale
        else:
            distance += 1.0
    similarity = department_similarity(local.get("d", ""), official.get("d", ""))
    exam_penalty = 0.0
    local_admission = clean(local.get("exam", "") or local.get("a", ""))
    official_exam = clean(official.get("exam", ""))
    route_keys = ("지역인재", "농어촌", "기초생활", "차상위", "특성화고", "실기", "일반")
    local_routes = [key for key in route_keys if key in local_admission]
    if local_routes and not any(key in official_exam for key in local_routes):
        exam_penalty = 2.0
    elif not local_routes and "일반" not in official_exam:
        exam_penalty = 0.2
    exam_similarity = difflib.SequenceMatcher(None, local_admission, official_exam).ratio() if local_admission and official_exam else 0.0
    return mismatches, distance + (1.0 - similarity) * 3.0 + exam_penalty + (1.0 - exam_similarity) * 2.0


def same_numeric_fingerprint(local: dict, official: dict) -> bool:
    if not official_value_available("n", official.get("n")) or not official_value_available("c", official.get("c")):
        return False
    if not same_number(local.get("n"), official.get("n")) or not same_number(local.get("c"), official.get("c")):
        return False
    compared = 0
    score_fields = 0
    for field in FIELDS:
        if not official_value_available(field, official.get(field)):
            continue
        compared += 1
        if field in {"cv50", "cv70", "p50", "p70"}:
            score_fields += 1
        if not same_number(local.get(field), official.get(field)):
            return False
    return compared >= 4 and score_fields >= 1


def compare_rows(local_rows: list[dict], official_rows: list[dict]) -> list[dict]:
    official_index: dict[str, list[dict]] = defaultdict(list)
    for row in official_rows:
        official_index[admission_group(row["a"])].append(row)

    report: list[dict] = []
    for local in local_rows:
        group_candidates = official_index.get(admission_group(local.get("a", "")), [])
        candidates = [
            row for row in group_candidates
            if department_similarity(local.get("d", ""), row.get("d", "")) >= 0.72
        ]
        local_exam = clean(local.get("exam", ""))
        if local_exam and candidates:
            similarities = [difflib.SequenceMatcher(None, local_exam, clean(row.get("exam", ""))).ratio() for row in candidates]
            best_exam_similarity = max(similarities)
            if best_exam_similarity >= 0.45:
                candidates = [row for row, similarity in zip(candidates, similarities) if similarity >= max(0.45, best_exam_similarity - 0.12)]
        if not candidates:
            fingerprint_candidates = [row for row in group_candidates if same_numeric_fingerprint(local, row)]
            if len(fingerprint_candidates) == 1:
                official = fingerprint_candidates[0]
                report.append(
                    {
                        "id": local["id"],
                        "year": local["y"],
                        "university": local["u"],
                        "admission": local["a"],
                        "department": local["d"],
                        "status": "수치 지문 일치",
                        "field": "",
                        "local": "",
                        "official": "",
                        "official_exam": official["exam"],
                        "official_department": official["d"],
                        "department_similarity": round(department_similarity(local["d"], official["d"]), 3),
                        "source": local["source"],
                    }
                )
                continue
            report.append(
                {
                    "id": local["id"],
                    "year": local["y"],
                    "university": local["u"],
                    "admission": local["a"],
                    "department": local["d"],
                    "status": "공식 행 미일치",
                    "field": "",
                    "local": "",
                    "official": "",
                    "official_exam": "",
                    "official_department": "",
                    "department_similarity": "",
                    "source": local["source"],
                }
            )
            continue
        official = min(candidates, key=lambda row: candidate_cost(local, row))
        similarity = department_similarity(local["d"], official["d"])
        if similarity < 0.94:
            fingerprint_candidates = [row for row in group_candidates if same_numeric_fingerprint(local, row)]
            if len(fingerprint_candidates) == 1:
                official = fingerprint_candidates[0]
                report.append(
                    {
                        "id": local["id"],
                        "year": local["y"],
                        "university": local["u"],
                        "admission": local["a"],
                        "department": local["d"],
                        "status": "수치 지문 일치",
                        "field": "",
                        "local": "",
                        "official": "",
                        "official_exam": official["exam"],
                        "official_department": official["d"],
                        "department_similarity": round(department_similarity(local["d"], official["d"]), 3),
                        "source": local["source"],
                    }
                )
                continue
            report.append(
                {
                    "id": local["id"],
                    "year": local["y"],
                    "university": local["u"],
                    "admission": local["a"],
                    "department": local["d"],
                    "status": "저신뢰 후보",
                    "field": "",
                    "local": "",
                    "official": "",
                    "official_exam": official["exam"],
                    "official_department": official["d"],
                    "department_similarity": round(similarity, 3),
                    "source": local["source"],
                }
            )
            continue
        mismatches = []
        compared = 0
        for field in FIELDS:
            if (int(local["id"]), field) in OFFICIAL_PORTAL_EXCEPTIONS:
                continue
            if not official_value_available(field, official.get(field)):
                continue
            compared += 1
            if not same_number(local.get(field), official.get(field)):
                mismatches.append(field)
                report.append(
                    {
                        "id": local["id"],
                        "year": local["y"],
                        "university": local["u"],
                        "admission": local["a"],
                        "department": local["d"],
                        "status": "수치 불일치",
                        "field": field,
                        "local": local.get(field),
                        "official": official.get(field),
                        "official_exam": official["exam"],
                        "official_department": official["d"],
                        "department_similarity": round(department_similarity(local["d"], official["d"]), 3),
                        "source": local["source"],
                    }
                )
        if not mismatches:
            report.append(
                {
                    "id": local["id"],
                    "year": local["y"],
                    "university": local["u"],
                    "admission": local["a"],
                    "department": local["d"],
                    "status": "일치" if compared else "공식 수치 미제공",
                    "field": "",
                    "local": "",
                    "official": "",
                    "official_exam": official["exam"],
                    "official_department": official["d"],
                    "department_similarity": round(department_similarity(local["d"], official["d"]), 3),
                    "source": local["source"],
                }
            )
    return report


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    local_by_pair: dict[tuple[str, str], list[dict]] = defaultdict(list)
    external_official_rows: list[dict] = []
    for row in data["scores"]:
        pair = source_pair(row)
        if pair is None:
            external_official_rows.append(row)
        else:
            local_by_pair[pair].append(row)

    contents: dict[tuple[str, str], str] = {}
    failures: dict[tuple[str, str], str] = {}
    pairs = sorted(local_by_pair)
    with ThreadPoolExecutor(max_workers=5) as executor:
        jobs = [executor.submit(fetch, pair) for pair in pairs]
        for index, job in enumerate(as_completed(jobs), 1):
            pair, content, error = job.result()
            if error:
                failures[pair] = error
            else:
                contents[pair] = content
            if index % 25 == 0 or index == len(jobs):
                print(f"공식 결과 {index}/{len(jobs)} 수집")

    report: list[dict] = []
    for local in external_official_rows:
        report.append(
            {
                "id": local["id"],
                "year": local["y"],
                "university": local["u"],
                "admission": local["a"],
                "department": local["d"],
                "status": "대학 공식자료 별도 확인",
                "field": "",
                "local": "",
                "official": "",
                "official_exam": "",
                "official_department": "",
                "department_similarity": "",
                "source": local["source"],
            }
        )
    official_row_count = 0
    for pair, local_rows in local_by_pair.items():
        content = contents.get(pair)
        if not content:
            for local in local_rows:
                report.append(
                    {
                        "id": local["id"],
                        "year": local["y"],
                        "university": local["u"],
                        "admission": local["a"],
                        "department": local["d"],
                        "status": "공식 페이지 수집 실패",
                        "field": "",
                        "local": "",
                        "official": "",
                        "official_exam": "",
                        "official_department": "",
                        "department_similarity": "",
                        "source": local["source"],
                    }
                )
            continue
        official_rows = parse_official(content)
        official_row_count += len(official_rows)
        if not official_rows:
            for local in local_rows:
                report.append(
                    {
                        "id": local["id"],
                        "year": local["y"],
                        "university": local["u"],
                        "admission": local["a"],
                        "department": local["d"],
                        "status": "공식 결과 미공개",
                        "field": "",
                        "local": "",
                        "official": "",
                        "official_exam": "",
                        "official_department": "",
                        "department_similarity": "",
                        "source": local["source"],
                    }
                )
        else:
            report.extend(compare_rows(local_rows, official_rows))

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    columns = ["id", "year", "university", "admission", "department", "status", "field", "local", "official", "official_exam", "official_department", "department_similarity", "source"]
    with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(report)

    exact_match_ids = {row["id"] for row in report if row["status"] == "일치"}
    fingerprint_match_ids = {row["id"] for row in report if row["status"] == "수치 지문 일치"}
    matched_ids = exact_match_ids | fingerprint_match_ids
    mismatch_ids = {row["id"] for row in report if row["status"] == "수치 불일치"}
    unmatched_ids = {row["id"] for row in report if row["status"] == "공식 행 미일치"}
    failed_ids = {row["id"] for row in report if row["status"] == "공식 페이지 수집 실패"}
    unverified_ids = {row["id"] for row in report if row["status"] == "공식 수치 미제공"}
    unavailable_result_ids = {row["id"] for row in report if row["status"] == "공식 결과 미공개"}
    low_confidence_ids = {row["id"] for row in report if row["status"] == "저신뢰 후보"}
    summary = {
        "local_rows": len(data["scores"]),
        "official_pairs": len(pairs),
        "university_official_attachment_rows": len(external_official_rows),
        "official_pairs_downloaded": len(contents),
        "official_pairs_failed": len(failures),
        "official_rows_parsed": official_row_count,
        "matched_rows": len(matched_ids),
        "exact_or_name_matched_rows": len(exact_match_ids),
        "numeric_fingerprint_matched_rows": len(fingerprint_match_ids),
        "mismatched_rows": len(mismatch_ids),
        "unmatched_rows": len(unmatched_ids),
        "download_failed_rows": len(failed_ids),
        "official_values_unavailable_rows": len(unverified_ids),
        "official_result_unavailable_rows": len(unavailable_result_ids),
        "low_confidence_candidate_rows": len(low_confidence_ids),
        "failures": {"|".join(pair): error for pair, error in failures.items()},
    }
    SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
