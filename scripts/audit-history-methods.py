from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
OUTPUT_PATH = ROOT / "audit" / "history-method-evidence.csv"


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\x00", " ")).strip()


def classify(snippets: list[str]) -> str:
    joined = " ".join(snippets)
    if re.search(r"한국사.{0,120}(?:감점|차감)|(?:감점|차감).{0,120}한국사", joined):
        return "감점"
    if re.search(r"한국사.{0,120}(?:가산점|가점)|(?:가산점|가점).{0,120}한국사", joined):
        return "가점"
    if re.search(r"한국사.{0,140}(?:환산점수|등급별.{0,20}(?:점수|배점)|반영점수|반영비율)|(?:환산점수|반영점수|반영비율).{0,140}한국사", joined):
        return "등급 환산"
    if re.search(r"한국사.{0,140}(?:미반영|반영하지 않|응시여부|응시 여부|지원자격|필수 응시|응시 필수)", joined):
        return "미반영"
    return "확인 필요"


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    cache: dict[str, tuple[int, dict[int, str]]] = {}
    rows: list[dict[str, str]] = []

    for profile in payload["profiles"]:
        source = profile.get("officialSourcePath") or ""
        page_texts: dict[int, str] = {}
        selected_pages: list[int] = []
        if source.lower().endswith(".pdf") and Path(source).exists():
            if source not in cache:
                document = PdfReader(source)
                cache[source] = (len(document.pages), {})
            page_count, page_texts = cache[source]
            anchors = [int(page) for page in (profile.get("officialSourcePages") or [profile.get("sourcePage")]) if isinstance(page, (int, float))]
            selected_pages = sorted({page for anchor in anchors for page in range(max(1, anchor - 2), min(page_count, anchor + 2) + 1)} | {page for page in (1, 2, 3) if page <= page_count})
            missing_pages = [page for page in selected_pages if page not in page_texts]
            if missing_pages:
                document = PdfReader(source)
                page_texts.update({page: compact(document.pages[page - 1].extract_text() or "") for page in missing_pages})

        snippets: list[str] = []
        pages: list[str] = []
        for page_number in selected_pages:
            text = page_texts.get(page_number, "")
            matches = list(re.finditer("한국사", text))
            if not matches:
                continue
            pages.append(str(page_number))
            for match in matches[:5]:
                start = max(0, match.start() - 150)
                end = min(len(text), match.start() + 260)
                snippets.append(text[start:end])

        rows.append(
            {
                "id": str(profile["id"]),
                "university": profile["u"],
                "method": classify(snippets),
                "pages": ",".join(pages),
                "evidence": " || ".join(snippets[:8]),
                "source": source,
            }
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "university", "method", "pages", "evidence", "source"])
        writer.writeheader()
        writer.writerows(rows)

    counts: dict[str, int] = {}
    for row in rows:
        counts[row["method"]] = counts.get(row["method"], 0) + 1
    print(json.dumps({"profiles": len(rows), "counts": counts, "output": str(OUTPUT_PATH)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
