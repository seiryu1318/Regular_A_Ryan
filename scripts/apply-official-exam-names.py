from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "official-results-audit.csv"


def main() -> None:
    candidates: dict[int, list[str]] = defaultdict(list)
    with AUDIT_PATH.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            exam = (row.get("official_exam") or "").strip()
            similarity = float(row.get("department_similarity") or 0)
            if exam and similarity >= 0.95:
                candidates[int(row["id"])].append(exam)

    resolved = {row_id: Counter(names).most_common(1)[0][0] for row_id, names in candidates.items()}
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    applied = 0
    for row in payload["scores"]:
        exam = resolved.get(int(row["id"]))
        if not exam:
            continue
        row["exam"] = exam.replace("·", " ").replace("・", " ")
        applied += 1

    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"rows": len(payload["scores"]), "official_exam_names": applied}, ensure_ascii=False))


if __name__ == "__main__":
    main()
