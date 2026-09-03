from __future__ import annotations

import re
import sys
from pathlib import Path

import pdfplumber


TERMS = (
    "수능 반영",
    "수능성적",
    "대학수학능력시험",
    "영역별 반영",
    "반영비율",
    "영어",
    "한국사",
    "가산점",
    "감점",
)


def page_score(text: str) -> int:
    compact = re.sub(r"\s+", "", text)
    return sum(1 for term in TERMS if re.sub(r"\s+", "", term) in compact)


def main() -> None:
    for raw in sys.argv[1:]:
        path = Path(raw)
        print(f"\n===== {path} =====")
        with pdfplumber.open(path) as document:
            ranked = []
            for index, page in enumerate(document.pages):
                text = page.extract_text() or ""
                score = page_score(text)
                if score >= 1:
                    ranked.append((score, index + 1, text))
            ranked.sort(key=lambda item: (-item[0], item[1]))
            for score, page_number, text in sorted(ranked[:8], key=lambda item: item[1]):
                print(f"\n--- page {page_number} score={score} ---")
                print(text[:12000])


if __name__ == "__main__":
    main()
