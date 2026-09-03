from __future__ import annotations

import argparse
import json
import os
import re
from concurrent.futures import ProcessPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path

from pypdf import PdfReader


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = PROJECT_ROOT / "public" / "admissions-data.json"
SOURCE_ROOT = Path(r"C:\Users\User\Desktop\업무\작업\21. 정시모집 관련\00. 소스(모집요강)")

ALIASES = {
    "강원대": "강원대(춘천삼척)",
    "강원대(강릉원주대)": "강원대(강릉원주)",
    "건국대(글로컬)": "건국대(글)",
    "고려대(세종)": "고려대(세)",
    "공주대": "국립공주대",
    "단국대": "단국대(죽)",
    "단국대(천안)": "단국대(천)",
    "대진대": "대진대",
    "동국대": "동국대(서)",
    "동국대(WISE)": "동국대(WISE)",
    "상명대": "상명대(서)",
    "상명대(천안)": "상명대(천)",
    "성결대": "성결대",
    "연세대": "연세대(서)",
    "연세대(미래)": "연세대(미)",
    "차의과학대": "차의과대",
    "한국교통대": "국립한국교통대",
    "한국기술교육대": "한국기술교대",
    "한국외국어대": "한국외대",
    "한양대": "한양대(서)",
    "한양대(ERICA)": "한양대(에)",
    "홍익대": "홍익대(서)",
    "홍익대(세종)": "홍익대(세)",
    "한국에너지공과대": "KENTECH",
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
    value = value.lower()
    value = value.replace("대학교", "대").replace("여자대", "여대")
    value = value.replace("국립", "").replace("2027", "")
    value = value.replace("정시요강", "").replace("모집요강", "")
    return re.sub(r"[^0-9a-z가-힣]", "", value)


def source_label(path: Path) -> str:
    return re.sub(r"^2027[_\s-]*", "", path.stem).replace("_정시요강", "")


def match_source(university: str, files: list[Path]) -> tuple[Path | None, float]:
    wanted = normalize(ALIASES.get(university, university))
    scored: list[tuple[float, Path]] = []
    for path in files:
        candidate = normalize(source_label(path))
        if wanted == candidate:
            score = 1.0
        elif wanted in candidate or candidate in wanted:
            score = 0.96
        else:
            score = SequenceMatcher(None, wanted, candidate).ratio()
        scored.append((score, path))
    score, path = max(scored, key=lambda item: item[0])
    return (path, score) if score >= 0.62 else (None, score)


def page_score(text: str) -> int:
    compact = re.sub(r"\s+", "", text)
    score = sum(8 for term in RATIO_TERMS if re.sub(r"\s+", "", term) in compact)
    score += 2 if "국어" in text else 0
    score += 2 if "수학" in text else 0
    score += 2 if "영어" in text else 0
    score += 2 if "탐구" in text else 0
    score += 2 if re.search(r"가산점|가점|감점", text) else 0
    score += 1 if "정시" in text else 0
    return score


def source_pages(path: Path) -> list[int]:
    if path.suffix.lower() != ".pdf":
        return []
    try:
        reader = PdfReader(path)
    except Exception:
        return []
    candidates: list[tuple[int, int]] = []
    for index, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception:
            continue
        score = page_score(text)
        if score >= 8:
            candidates.append((score, index + 1))
    candidates.sort(key=lambda item: (-item[0], item[1]))
    return sorted(page for _, page in candidates[:4])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    source_files = sorted(path for path in SOURCE_ROOT.rglob("*") if path.is_file())
    matched = 0
    unresolved: list[tuple[str, float]] = []
    matched_profiles: list[tuple[dict, Path]] = []

    for profile in data["profiles"]:
        path, score = match_source(profile["u"], source_files)
        if path is None:
            unresolved.append((profile["u"], score))
            continue
        matched += 1
        profile["officialSourceFile"] = path.name
        profile["officialSourcePath"] = str(path)
        matched_profiles.append((profile, path))
        if not args.write:
            print(f"{profile['u']:<16} {score:.2f}  {path.name}")

    print(f"matched={matched}/{len(data['profiles'])}")
    if unresolved:
        print("unresolved=" + ", ".join(f"{name}({score:.2f})" for name, score in unresolved))

    if args.write:
        unique_paths = sorted({path for _, path in matched_profiles})
        pages_by_path: dict[Path, list[int]] = {}
        worker_count = min(8, os.cpu_count() or 4, len(unique_paths))
        with ProcessPoolExecutor(max_workers=worker_count) as executor:
            futures = {executor.submit(source_pages, path): path for path in unique_paths}
            for index, future in enumerate(as_completed(futures), start=1):
                path = futures[future]
                try:
                    pages_by_path[path] = future.result()
                except Exception:
                    pages_by_path[path] = []
                if index % 10 == 0 or index == len(unique_paths):
                    print(f"indexed={index}/{len(unique_paths)}", flush=True)
        for profile, path in matched_profiles:
            profile["officialSourcePages"] = pages_by_path.get(path, [])
        source_name = "대학별 2027학년도 정시모집요강"
        if not any(source.get("name") == source_name for source in data["sources"]):
            data["sources"].append({"name": source_name, "organization": "대학별 입학처", "local": True})
        DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
