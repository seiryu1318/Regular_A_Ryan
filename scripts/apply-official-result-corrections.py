from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
REPORT_PATH = ROOT / "audit" / "official-results-audit.csv"
CHANGE_PATH = ROOT / "audit" / "official-results-corrections.json"
FIELDS = {"n", "c", "add", "cv50", "cv70", "p50", "p70"}
OFFICIAL_EXCEPTIONS = {(8119, "cv70")}


def numeric(value: str):
    text = (value or "").strip()
    if not text:
        return None
    result = float(text)
    return int(result) if result.is_integer() else result


data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
scores = {int(row["id"]): row for row in data["scores"]}
changes = json.loads(CHANGE_PATH.read_text(encoding="utf-8")) if CHANGE_PATH.exists() else []
change_keys = {(item["id"], item["field"], item["after"]) for item in changes}

with REPORT_PATH.open(encoding="utf-8-sig", newline="") as handle:
    for item in csv.DictReader(handle):
        if item["status"] != "수치 불일치":
            continue
        if float(item["department_similarity"] or 0) < 0.94 or item["field"] not in FIELDS:
            continue
        if (int(item["id"]), item["field"]) in OFFICIAL_EXCEPTIONS:
            continue
        official = numeric(item["official"])
        field = item["field"]
        if official is None:
            continue
        if field in {"n", "c"} and official <= 0:
            continue
        row = scores[int(item["id"])]
        before = row.get(field)
        if before == official:
            continue
        row[field] = official
        change = {
                "id": row["id"],
                "year": row["y"],
                "university": row["u"],
                "admission": row["a"],
                "department": row["d"],
                "field": field,
                "before": before,
                "after": official,
                "official_exam": item["official_exam"],
                "source": row["source"],
            }
        key = (change["id"], change["field"], change["after"])
        if key not in change_keys:
            changes.append(change)
            change_keys.add(key)

for row in data["scores"]:
    n = row.get("n")
    competition = row.get("c")
    additional = row.get("add")
    if all(isinstance(value, (int, float)) for value in (n, competition, additional)) and n + additional > 0:
        row["x"] = round(n * competition / (n + additional), 4)

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
CHANGE_PATH.write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"corrected_fields": len(changes), "corrected_rows": len({item['id'] for item in changes})}, ensure_ascii=False))
