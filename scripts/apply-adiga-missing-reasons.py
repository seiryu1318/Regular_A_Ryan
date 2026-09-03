from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
CACHE_DIR = ROOT / "audit" / "adiga-results"
AUDIT_PATH = ROOT / "audit" / "adiga-missing-reasons.json"


def clean(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value or "").lower()


def admission_group(value: str) -> str:
    match = re.search(r"[가나다]", value or "")
    return match.group() if match else ""


def source_pair(row: dict) -> tuple[str, str] | None:
    source = row.get("source") or ""
    code = re.search(r"unvCd=(\d+)", source)
    source_year = re.search(r"searchSyr=(\d{4})", source)
    return (code.group(1), source_year.group(1)) if code and source_year else None


def table_label(table) -> str:
    node = table.getprevious()
    while node is not None:
        text = " ".join(node.text_content().split())
        if text:
            return text
        node = node.getprevious()
    return ""


def cache_reasons(path: Path) -> list[dict]:
    root = html.fromstring(path.read_text(encoding="utf-8"))
    results: list[dict] = []
    for table in root.xpath("//table"):
        exam = table_label(table)
        for tr in table.xpath(".//tbody/tr"):
            cells = [" ".join(cell.text_content().split()) for cell in tr.xpath("./td")]
            reason_cell = next((cell for cell in cells if "미제출 사유" in cell), "")
            if len(cells) < 2 or not reason_cell:
                continue
            reason = re.sub(r"^.*?미제출 사유\s*:\s*", "", reason_cell).strip()
            if not reason:
                continue
            results.append({
                "exam": exam,
                "group": admission_group(cells[0]),
                "department": cells[1],
                "reason": reason,
            })
    return results


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    reasons_by_pair: dict[tuple[str, str], dict[tuple[str, str], list[dict]]] = {}
    for path in CACHE_DIR.glob("*.html"):
        match = re.fullmatch(r"(\d{4})-(\d+)\.html", path.name)
        if not match:
            continue
        source_year, code = match.groups()
        grouped: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for item in cache_reasons(path):
            grouped[(item["group"], clean(item["department"]))].append(item)
        reasons_by_pair[(code, source_year)] = grouped

    applied: list[dict] = []
    for row in payload["scores"]:
        row.pop("missingReason", None)
        pair = source_pair(row)
        reason = ""
        if pair and all(row.get(field) is None for field in ("p50", "p70", "cv50", "cv70")):
            candidates = reasons_by_pair.get(pair, {}).get((admission_group(row.get("g") or row.get("a", "")), clean(row.get("d", ""))), [])
            local_exam = clean(row.get("exam") or "")
            if "일반" in local_exam:
                candidates = [candidate for candidate in candidates if "일반" in clean(candidate["exam"])]
            unique_reasons = sorted({candidate["reason"] for candidate in candidates})
            if len(unique_reasons) == 1:
                reason = unique_reasons[0]

        if not reason:
            publisher = "대학어디가" if pair else "대학 입학처 공개 자료"
            missing: list[str] = []
            metric = str(row.get("metric") or "")
            cut_label = "백분위" if "백분위" in metric else "표준점수" if "표준점수" in metric else "성적"
            if row.get("p50") is None:
                missing.append(f"{cut_label} 50%")
            if row.get("p70") is None:
                missing.append(f"{cut_label} 70%")
            if row.get("cv50") is None:
                missing.append("환산점수 50%")
            if row.get("cv70") is None:
                missing.append("환산점수 70%")
            if missing:
                reason = f"{publisher}에 {', '.join(missing)} 미공개"

        if not reason:
            continue
        row["missingReason"] = reason
        applied.append({
            "id": row["id"],
            "year": row["y"],
            "university": row["u"],
            "department": row["d"],
            "reason": reason,
        })

    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    AUDIT_PATH.write_text(json.dumps(applied, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"applied": len(applied)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
