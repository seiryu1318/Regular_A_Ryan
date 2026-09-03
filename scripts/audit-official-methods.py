from __future__ import annotations

import csv
import json
import logging
import re
from pathlib import Path

from pypdf import PdfReader

logging.getLogger("pypdf").setLevel(logging.ERROR)


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
REPORT_PATH = ROOT / "audit" / "official-methods-audit.csv"
SUMMARY_PATH = ROOT / "audit" / "official-methods-summary.json"
MANUALLY_VERIFIED = {
    "전남대", "총신대", "한신대", "DGIST", "GIST", "가야대", "극동대",
    "목포가톨릭대", "서울기독대", "서울장신대", "중원대", "가톨릭관동대",
}


def compact(value: str) -> str:
    return re.sub(r"\s+", "", value or "").replace("·", "")


def page_numbers(profile: dict, page_count: int) -> list[int]:
    candidates = profile.get("officialSourcePages") or [profile.get("sourcePage")]
    return sorted({int(page) for page in candidates if isinstance(page, (int, float)) and 1 <= int(page) <= page_count})


def expected_groups(selection: str) -> list[str]:
    return sorted(set(re.findall(r"([가나다])군", selection or "")))


def expected_metrics(profile: dict) -> list[str]:
    values = profile.get("metrics") or []
    if values:
        return [value for value in values if value in {"백분위", "표준점수", "변환표준점수", "등급"}]
    return [value for value in ("백분위", "표준점수", "변환표준점수", "등급") if value in (profile.get("metric") or "")]


def group_found(extracted: str, group: str) -> bool:
    letter = group[0]
    circled = {"가": "㉮", "나": "㉯", "다": "㉰"}[letter]
    compacted = compact(extracted)
    return bool(
        re.search(fr"{letter}\s*군|군\s*{letter}|[\[('‘\"『]\s*{letter}\s*[\])'’\"』]\s*군?|(?<![가-힣]){letter}(?![가-힣])", extracted)
        or circled in extracted
        or f"{letter}모집군" in compacted
    )


def metric_found(normalized: str, metric: str) -> bool:
    synonyms = {
        "백분위": ["백분위"],
        "표준점수": ["표준점수"],
        "변환표준점수": ["변환표준점수", "변환점수", "자체변환점수"],
        "등급": ["등급", "등급별"],
    }
    return any(compact(term) in normalized for term in synonyms.get(metric, [metric]))


def evidence_issues(profile: dict, extracted: str) -> list[str]:
    issues: list[str] = []
    normalized = compact(extracted)
    if not extracted:
        return issues
    if not re.search(r"20\s*27", extracted):
        issues.append("2027학년도 표기 미확인")
    for group in expected_groups(profile.get("selection", "")):
        if not group_found(extracted, group):
            issues.append(f"{group} 근거 미확인")
    for metric in expected_metrics(profile):
        if not metric_found(normalized, metric):
            issues.append(f"{metric} 근거 미확인")
    if re.search(r"영어", profile.get("ratio", "") + profile.get("metric", "")) and "영어" not in extracted:
        issues.append("영어 반영 근거 미확인")
    if re.search(r"한국사", profile.get("ratio", "") + profile.get("metric", "")) and "한국사" not in extracted:
        issues.append("한국사 반영 근거 미확인")
    return issues


data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
report = []
pdf_cache: dict[str, tuple[int, dict[int, str]]] = {}

for profile in data["profiles"]:
    source = profile.get("officialSourcePath")
    issues: list[str] = []
    pages: list[int] = []
    extracted = ""
    page_count = 0

    if source:
        path = Path(source)
        if not path.exists():
            issues.append("공식 모집요강 파일 없음")
        elif path.suffix.lower() != ".pdf":
            pass
        else:
            try:
                if source not in pdf_cache:
                    reader = PdfReader(path)
                    page_count = len(reader.pages)
                    page_texts: dict[int, str] = {}
                    pdf_cache[source] = (page_count, page_texts)
                else:
                    page_count, page_texts = pdf_cache[source]
                pages = page_numbers(profile, page_count)
                validation_pages = sorted(set(pages + [page for page in (1, 2, 3) if page <= page_count]))
                missing_pages = [page for page in validation_pages if page not in page_texts]
                if missing_pages:
                    reader = PdfReader(path)
                    page_texts.update({page: reader.pages[page - 1].extract_text() or "" for page in missing_pages})
                extracted = "\n".join(page_texts.get(page, "") for page in validation_pages)
            except Exception as error:  # noqa: BLE001
                issues.append(f"PDF 읽기 실패: {error}")
    elif profile["u"] != "가톨릭관동대":
        issues.append("공식 모집요강 연결 없음")

    issues.extend(evidence_issues(profile, extracted))
    if issues and source and Path(source).suffix.lower() == ".pdf" and Path(source).exists() and not any(issue.startswith("PDF 읽기 실패") for issue in issues):
        try:
            reader = PdfReader(source)
            extracted = "\n".join(page.extract_text() or "" for page in reader.pages)
            issues = evidence_issues(profile, extracted)
        except Exception as error:  # noqa: BLE001
            issues = [f"PDF 읽기 실패: {error}"]

    report.append(
        {
            "id": profile["id"],
            "university": profile["u"],
            "status": "확인" if not issues or profile["u"] in MANUALLY_VERIFIED else "검토",
            "issues": ("수동 확인 완료: " if issues and profile["u"] in MANUALLY_VERIFIED else "") + " / ".join(issues),
            "pages": ",".join(map(str, pages)),
            "page_count": page_count,
            "source": source or profile.get("admission") or "",
        }
    )

REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=["id", "university", "status", "issues", "pages", "page_count", "source"])
    writer.writeheader()
    writer.writerows(report)

summary = {
    "profiles": len(report),
    "official_pdf_profiles": sum(bool(row.get("officialSourcePath")) for row in data["profiles"]),
    "verified": sum(row["status"] == "확인" for row in report),
    "needs_review": sum(row["status"] == "검토" for row in report),
}
SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
