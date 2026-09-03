"""시도교육청 2027 대입 자료의 가용성과 대학명 교차 확인 범위를 기록한다."""

from __future__ import annotations

import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
REPORT_PATH = ROOT / "audit" / "education-office-sources.json"
SOURCES = [
    (
        "울산교육청",
        Path(r"C:\Users\User\iCloudDrive\02. 진학 및 상담자료\01. 진학자료\02. 공통자료\08. 전공안내서 및 학생부종합 가이드북\시도교육청 발간자료\2027학년도 울산교육청 대입전형 가이드북.pdf"),
    ),
    (
        "서울교육청",
        Path(r"C:\Users\User\iCloudDrive\02. 진학 및 상담자료\01. 진학자료\02. 공통자료\08. 전공안내서 및 학생부종합 가이드북\시도교육청 발간자료\2027학년도 서울교육청 대입전형 가이드북.pdf"),
    ),
    (
        "인천교육청",
        Path(r"C:\Users\User\Desktop\2027대입전형프리뷰수정(인천시교육청배포판).pdf"),
    ),
]


def compact(value: str) -> str:
    return re.sub(r"\s+", "", value or "").replace("·", "")


def aliases(name: str) -> set[str]:
    values = {compact(name)}
    values.add(re.sub(r"\([^)]*\)", "", compact(name)))
    values |= {value.replace("국립", "") for value in list(values)}
    values |= {value.replace("대학교", "대") for value in list(values)}
    return {value for value in values if len(value) >= 2}


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    university_names = sorted({row["u"] for row in data["changes"]} | {row["u"] for row in data["profiles"]})
    source_reports: list[dict[str, object]] = []
    combined = ""
    failures: list[str] = []

    for agency, path in SOURCES:
        item: dict[str, object] = {"agency": agency, "path": str(path), "exists": path.exists()}
        if not path.exists():
            failures.append(f"{agency}: 파일 없음")
            source_reports.append(item)
            continue
        try:
            reader = PdfReader(path)
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            normalized = compact(text)
            item.update(
                {
                    "pages": len(reader.pages),
                    "contains2027": "2027" in normalized,
                    "containsRegularAdmission": "정시" in normalized,
                    "textCharacters": len(text),
                }
            )
            if not item["contains2027"] or not item["containsRegularAdmission"]:
                failures.append(f"{agency}: 2027 정시 표기 미확인")
            combined += "\n" + normalized
        except Exception as error:  # noqa: BLE001
            item["error"] = str(error)
            failures.append(f"{agency}: 읽기 실패")
        source_reports.append(item)

    covered = [name for name in university_names if any(alias in combined for alias in aliases(name))]
    uncovered = sorted(set(university_names) - set(covered))
    report = {
        "sources": source_reports,
        "sourceFailures": failures,
        "universitiesChecked": len(university_names),
        "universitiesNamedInEducationOfficeSources": len(covered),
        "universitiesNotNamed": uncovered,
        "note": "시도교육청 자료에 대학별 수치가 없는 경우 대학 입학처 모집요강과 대학어디가를 기준으로 검증",
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "universitiesNotNamed"}, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
