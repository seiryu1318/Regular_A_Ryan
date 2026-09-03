from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "region-corrections.json"

REGIONS = {
    "강원대(강릉원주대)": "강원",
    "강원대(강릉)": "강원",
    "강원대(원주)": "강원",
    "건국대(글로컬)": "충북",
    "광주대": "광주",
    "단국대": "경기",
    "상명대": "서울",
    "차의과학대": "경기",
    "추계예술대": "서울",
    "한국외국어대": "서울",
    "서울장신대": "경기",
    "전남대(여수)": "전남",
}


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    changes: list[dict] = json.loads(AUDIT_PATH.read_text(encoding="utf-8")) if AUDIT_PATH.exists() else []
    change_keys = {(item["collection"], item["id"], item["after"]) for item in changes}
    for collection in ("profiles", "scores"):
        for row in payload[collection]:
            region = REGIONS.get(row["u"])
            if not region or row.get("r") == region:
                continue
            change = {
                    "collection": collection,
                    "id": row["id"],
                    "university": row["u"],
                    "before": row.get("r"),
                    "after": region,
                }
            key = (change["collection"], change["id"], change["after"])
            if key not in change_keys:
                changes.append(change)
                change_keys.add(key)
            row["r"] = region

    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    AUDIT_PATH.write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"corrected": len(changes)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
