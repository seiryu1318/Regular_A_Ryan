from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import pymupdf


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = PROJECT_ROOT / "public" / "admissions-data.json"
SOURCE_ROOT = Path(r"C:\Users\User\Desktop\업무\작업\21. 정시모집 관련\00. 소스(모집요강)")

PROFILE_ALIASES = {
    "국립강릉원주대": "강원대(강릉원주대)",
    "국립공주대": "공주대",
    "국립한국교통대": "한국교통대",
    "단국대(죽전)": "단국대",
    "상명대(서울)": "상명대",
    "차의과대": "차의과학대",
    "추계예술대": "추계예대",
    "한국외대": "한국외국어대",
    "한국외대(글)": "한국외국어대",
    "전남대(여수)": "전남대",
}

SOURCE_ALIASES = {
    "감신대": "감리교신학대",
    "건국대(글)": "건국대(글)",
    "국립한국해양대": "한국해양대",
    "단국대(죽전)": "단국대",
    "상명대(서울)": "상명대(서)",
    "차의과대": "차의과대",
    "추계예술대": "추계예대",
    "한국외대(글)": "한국외대",
    "전남대(여수)": "전남대",
}

RATIO_TERMS = (
    "수능 영역별 반영비율",
    "수능영역별 반영비율",
    "수능 영역별 반영 비율",
    "대학수학능력시험 성적 반영방법",
    "대학수학능력시험성적 반영방법",
    "대학수학능력시험 반영방법",
    "수능성적 반영방법",
    "수능 성적 반영방법",
    "수능 반영방법",
)


def normalize(value: str) -> str:
    value = value.lower().replace("대학교", "대").replace("여자대", "여대")
    value = value.replace("국립", "").replace("2027", "")
    value = value.replace("정시요강", "").replace("모집요강", "")
    return re.sub(r"[^0-9a-z가-힣]", "", value)


def source_name(path: Path) -> str:
    return re.sub(r"^2027[_\s-]*", "", path.stem).replace("_정시요강", "").replace("_모집요강", "")


def source_for(university: str, files: list[Path]) -> Path | None:
    wanted = normalize(SOURCE_ALIASES.get(university, university))
    exact = [path for path in files if normalize(source_name(path)) == wanted]
    if exact:
        return sorted(exact, key=lambda path: (path.suffix.lower() != ".pdf", len(str(path))))[0]
    contained = [path for path in files if wanted in normalize(source_name(path)) or normalize(source_name(path)) in wanted]
    if contained:
        return sorted(contained, key=lambda path: (path.suffix.lower() != ".pdf", abs(len(normalize(source_name(path))) - len(wanted))))[0]
    return None


def page_score(text: str) -> int:
    compact = re.sub(r"\s+", "", text)
    score = sum(16 for term in RATIO_TERMS if re.sub(r"\s+", "", term) in compact)
    score += 5 if re.search(r"영역별\s*(?:가중치|반영\s*비율)", text) else 0
    score += 3 if re.search(r"활용\s*지표|백분위|표준점수", text) else 0
    score += 2 if "국어" in text else 0
    score += 2 if "수학" in text else 0
    score += 2 if "영어" in text else 0
    score += 2 if "탐구" in text else 0
    score += 2 if re.search(r"가산점|가점|감점", text) else 0
    score -= 4 if re.search(r"실기고사|실기전형", text) else 0
    return score


def relevant_pages(path: Path) -> tuple[list[int], str]:
    ranked: list[tuple[int, int, str]] = []
    with pymupdf.open(path) as document:
        for index, page in enumerate(document):
            try:
                text = page.get_text("text") or ""
            except Exception:
                continue
            score = page_score(text)
            if score >= 10:
                ranked.append((score, index + 1, text))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    selected = sorted(ranked[:3], key=lambda item: item[1])
    pages = [page for _, page, _ in selected]
    text = "\n".join(re.sub(r"\s+", " ", content).strip() for _, _, content in selected)
    return pages, text[:30000]


def metrics_from(text: str) -> list[str]:
    metrics = []
    for metric in ("백분위", "표준점수", "변환표준점수", "등급"):
        if metric in text:
            metrics.append(metric)
    return metrics or ["백분위"]


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    source_files = sorted(path for path in SOURCE_ROOT.rglob("*") if path.is_file())
    score_universities = sorted({row["u"] for row in data["scores"]})
    profile_universities = {row["u"] for row in data["profiles"]}
    next_id = max(row["id"] for row in data["profiles"]) + 1
    added = []
    unresolved = []

    for university in score_universities:
        canonical = PROFILE_ALIASES.get(university, university)
        if canonical in profile_universities:
            continue
        source = source_for(university, source_files)
        if source is None or source.suffix.lower() != ".pdf":
            unresolved.append((university, str(source) if source else ""))
            continue
        try:
            pages, ratio_text = relevant_pages(source)
        except Exception:
            unresolved.append((university, str(source)))
            continue
        if not ratio_text:
            unresolved.append((university, str(source)))
            continue
        university_scores = [row for row in data["scores"] if row["u"] == university]
        regions = Counter(row["r"] for row in university_scores if row.get("r"))
        groups = sorted({row["g"] for row in university_scores if row.get("g")}, key=lambda value: "가나다".find(value))
        metrics = metrics_from(ratio_text)
        profile = {
            "id": next_id,
            "u": university,
            "formal": f"{university} 2027학년도 정시모집",
            "r": regions.most_common(1)[0][0] if regions else "",
            "selection": f"{', '.join(f'{group}군' for group in groups) if groups else '군외'} 수능 중심 전형",
            "ratio": ratio_text,
            "metric": " ".join(metrics),
            "metrics": metrics,
            "sb": None,
            "sbDetail": "모집요강 전형별 확인",
            "sourceFile": source.name,
            "sourcePage": pages[0] if pages else 1,
            "officialSourceFile": source.name,
            "officialSourcePath": str(source),
            "officialSourcePages": pages,
            "admission": next((row.get("admission") for row in university_scores if row.get("admission")), None),
            "resultSource": next((row.get("source") for row in university_scores if row.get("source")), None),
        }
        data["profiles"].append(profile)
        profile_universities.add(university)
        next_id += 1
        added.append((university, source.name, pages))

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"added={len(added)} unresolved={len(unresolved)}")
    for university, source, pages in added:
        print(f"ADDED\t{university}\t{source}\t{','.join(map(str, pages))}")
    for university, source in unresolved:
        print(f"UNRESOLVED\t{university}\t{source}")


if __name__ == "__main__":
    main()
