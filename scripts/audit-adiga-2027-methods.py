from __future__ import annotations

import csv
import json
import os
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
CACHE_DIR = ROOT / "audit" / "adiga-2027-methods"
REPORT_PATH = ROOT / "audit" / "adiga-2027-methods-audit.csv"
SUMMARY_PATH = ROOT / "audit" / "adiga-2027-methods-summary.json"
DETAIL_URL = (
    "https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do"
    "?menuId=PCUVTINF2000&searchSyr=2027&unvCd={code}"
)
PROFILE_SCORE_ALIASES = {
    "강원대(강릉원주대)": ["강원대(강릉)", "강원대(원주)"],
    "단국대": ["단국대(죽전)"],
    "상명대": ["상명대(서울)"],
    "차의과학대": ["차의과대"],
    "한국외국어대": ["한국외대", "한국외대(글)"],
}
CODE_OVERRIDES = {
    # 대입정보포털 대학 개편 뒤 영산대 본교 코드가 변경되었다.
    "영산대": "0003193",
}
ADIGA_EXCEPTIONS = {
    "한국에너지공과대": "대입정보포털 일반대학 평가기준 미제공, 대학 공식 모집요강 대조",
    "DGIST": "대입정보포털 일반대학 평가기준 미제공, 대학 공식 모집요강 대조",
    "GIST": "대입정보포털 일반대학 평가기준 미제공, 대학 공식 모집요강 대조",
    "UNIST": "대입정보포털 일반대학 평가기준 미제공, 대학 공식 모집요강 대조",
    "KAIST": "대입정보포털 일반대학 평가기준 미제공, 대학 공식 모집요강 대조",
}
PORTAL_CONTENT_EXCEPTIONS = {
    # 2027 화면의 수능위주전형 본문이 2025학년도로 남아 있어 대학 공식 모집요강을 우선한다.
    "서울장신대": "대입정보포털 2027 수능위주전형 본문 연도 불일치, 대학 공식 모집요강 우선",
}


def compact(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value or "").lower()


def source_code(source: str | None) -> str | None:
    match = re.search(r"unvCd=(\d+)", source or "")
    return match.group(1) if match else None


def profile_code(profile: dict, scores: list[dict]) -> str | None:
    if profile["u"] in CODE_OVERRIDES:
        return CODE_OVERRIDES[profile["u"]]
    direct = source_code(profile.get("resultSource"))
    if direct:
        return direct
    names = PROFILE_SCORE_ALIASES.get(profile["u"], [profile["u"]])
    codes = {
        code
        for score in scores
        if score.get("u") in names
        for code in [source_code(score.get("source"))]
        if code
    }
    return sorted(codes)[0] if len(codes) == 1 else None


def fetch(code: str) -> tuple[str, str, str | None]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{code}.html"
    if os.environ.get("ADIGA_2027_REFRESH") != "1" and cache.exists() and cache.stat().st_size > 5000:
        return code, cache.read_text(encoding="utf-8"), None
    request = urllib.request.Request(
        DETAIL_URL.format(code=code),
        headers={"User-Agent": "Mozilla/5.0 admissions-method-audit"},
    )
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                content = response.read().decode("utf-8")
            if len(content) < 5000:
                raise ValueError(f"빈 응답 {len(content)} bytes")
            cache.write_text(content, encoding="utf-8")
            return code, content, None
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    return code, "", str(last_error)


def regular_section(content: str) -> tuple[str, str]:
    root = html.fromstring(content)
    text = " ".join(root.text_content().split())
    starts = [match.end() for match in re.finditer(r"2027\s*학년도\s*전형별\s*주요사항", text)]
    candidates: list[str] = []
    for start in starts:
        end_match = re.search(r"2026\s*학년도\s*전형\s*결과", text[start:])
        end = start + end_match.start() if end_match else min(len(text), start + 100000)
        candidates.append(text[start:end])
    if not candidates:
        return text, ""
    section = max(
        candidates,
        key=lambda value: sum(value.count(term) for term in ("수능", "영어", "한국사", "표준점수", "백분위", "반영비율")),
    )
    return text, section


def expected_groups(selection: str) -> list[str]:
    return sorted(set(re.findall(r"([가나다])\s*군", selection or "")))


def expected_metrics(profile: dict) -> list[str]:
    metrics = profile.get("metrics") or []
    if not metrics:
        metrics = [
            metric
            for metric in ("백분위", "표준점수", "변환표준점수", "등급")
            if metric in (profile.get("metric") or "")
        ]
    return [metric for metric in metrics if metric in {"백분위", "표준점수", "변환표준점수", "등급"}]


def section_checks(profile: dict, page_text: str, section: str) -> tuple[list[str], list[str]]:
    structural: list[str] = []
    evidence: list[str] = []
    normalized_page = compact(page_text)
    normalized_section = compact(section)
    if "2027학년도전형평가기준및결과공개자료" not in normalized_page:
        structural.append("2027학년도 자료 표기 미확인")
    if "수능위주전형" not in normalized_page:
        structural.append("수능위주전형 탭 미확인")
    if not section or "수능" not in section:
        structural.append("2027 수능위주 주요사항 미확인")
        return structural, evidence
    for group in expected_groups(profile.get("selection", "")):
        if f"{group}군" not in normalized_section and f"수능{group}군" not in normalized_section:
            evidence.append(f"{group}군 근거 미확인")
    for metric in expected_metrics(profile):
        if compact(metric) not in normalized_section:
            evidence.append(f"{metric} 근거 미확인")
    if "영어" in (profile.get("ratio") or "") and "영어" not in section:
        evidence.append("영어 반영 근거 미확인")
    if "한" in (profile.get("ratio") or "") and "한국사" not in section:
        evidence.append("한국사 반영 근거 미확인")
    if profile.get("sb") and "학생부" not in section:
        evidence.append("학생부 반영 근거 미확인")
    return structural, evidence


data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
profiles = data["profiles"]
scores = data["scores"]
profile_codes = {profile["u"]: profile_code(profile, scores) for profile in profiles}
codes = sorted({code for code in profile_codes.values() if code})

downloaded: dict[str, tuple[str, str | None]] = {}
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = {executor.submit(fetch, code): code for code in codes}
    for index, future in enumerate(as_completed(futures), 1):
        code, content, error = future.result()
        downloaded[code] = (content, error)
        if index % 20 == 0 or index == len(codes):
            print(f"대입정보포털 2027 수능위주전형 {index}/{len(codes)} 확인")

parsed: dict[str, tuple[str, str]] = {}
report: list[dict] = []
for profile in profiles:
    university = profile["u"]
    code = profile_codes[university]
    if not code:
        exception = ADIGA_EXCEPTIONS.get(university)
        issues = "" if exception else "대입정보포털 대학 코드 미연결"
        report.append(
            {
                "id": profile["id"],
                "university": university,
                "code": "",
                "status": "공식입학처" if exception else "검토",
                "issues": issues,
                "evidence_warnings": "",
                "section_characters": 0,
                "source": "",
                "note": exception or "",
            }
        )
        continue

    content, error = downloaded.get(code, ("", "다운로드 결과 없음"))
    if error:
        structural = [f"페이지 수집 실패: {error}"]
        evidence: list[str] = []
        section = ""
    else:
        if code not in parsed:
            parsed[code] = regular_section(content)
        page_text, section = parsed[code]
        structural, evidence = section_checks(profile, page_text, section)
    content_exception = PORTAL_CONTENT_EXCEPTIONS.get(university)
    if content_exception:
        structural = []
        evidence = []
    report.append(
        {
            "id": profile["id"],
            "university": university,
            "code": code,
            "status": "공식입학처" if content_exception else "확인+입학처" if evidence and not structural else "확인" if not structural else "검토",
            "issues": " / ".join(structural),
            "evidence_warnings": " / ".join(evidence),
            "section_characters": len(section),
            "source": DETAIL_URL.format(code=code),
            "note": content_exception or "",
        }
    )

REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
    writer = csv.DictWriter(
        handle,
        fieldnames=["id", "university", "code", "status", "issues", "evidence_warnings", "section_characters", "source", "note"],
    )
    writer.writeheader()
    writer.writerows(report)

summary = {
    "profiles": len(report),
    "adiga_profiles": sum(row["status"].startswith("확인") for row in report),
    "official_admission_exceptions": sum(row["status"] == "공식입학처" for row in report),
    "unique_adiga_pages": len(codes),
    "download_failures": sum("페이지 수집 실패" in row["issues"] for row in report),
    "evidence_warnings_checked_against_official_admissions": sum(bool(row["evidence_warnings"]) for row in report),
    "needs_review": sum(row["status"] == "검토" for row in report),
}
SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
