from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "profile-deduplication.json"
REMOVE_IDS = {8}


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    removed = [row for row in payload["profiles"] if int(row["id"]) in REMOVE_IDS]
    payload["profiles"] = [row for row in payload["profiles"] if int(row["id"]) not in REMOVE_IDS]
    payload["summary"]["profiles"] = len(payload["profiles"])
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    AUDIT_PATH.write_text(
        json.dumps(
            [
                {
                    "id": row["id"],
                    "university": row["u"],
                    "reason": "같은 공식 모집요강을 쓰는 건국대(글) 상세 프로필과 중복",
                }
                for row in removed
            ],
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(json.dumps({"profiles": len(payload["profiles"]), "removed": len(removed)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
