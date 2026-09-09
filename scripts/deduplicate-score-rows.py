from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "duplicate-score-corrections.json"

KEY_FIELDS = (
    "u", "y", "a", "g", "d", "t", "n", "c", "x", "add", "cv50", "cv70",
    "max", "p50", "p70", "ko", "ma", "inq", "en", "r", "source", "admission",
    "metric", "sb", "exam",
)


def record_key(row: dict) -> tuple:
    return tuple(json.dumps(row.get(field), ensure_ascii=False, sort_keys=True) for field in KEY_FIELDS)


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    unique_rows: list[dict] = []
    first_by_key: dict[tuple, dict] = {}
    removals: list[dict] = []

    for row in payload["scores"]:
        key = record_key(row)
        kept = first_by_key.get(key)
        if kept is None:
            first_by_key[key] = row
            unique_rows.append(row)
            continue
        removals.append(
            {
                "removed_id": row["id"],
                "kept_id": kept["id"],
                "university": row["u"],
                "year": row["y"],
                "department": row["d"],
                "exam": row.get("exam") or row.get("a"),
                "source": row.get("source"),
            }
        )

    payload["scores"] = unique_rows
    if isinstance(payload.get("summary"), dict):
        payload["summary"]["resultRows"] = len(unique_rows)
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    previous_removals = []
    if AUDIT_PATH.exists():
        previous_removals = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))
    removal_by_id = {item["removed_id"]: item for item in previous_removals}
    removal_by_id.update({item["removed_id"]: item for item in removals})
    audit_rows = list(removal_by_id.values())
    AUDIT_PATH.write_text(json.dumps(audit_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "removed_rows": len(removals),
                "recorded_corrections": len(audit_rows),
                "remaining_rows": len(unique_rows),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
