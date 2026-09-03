from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "track-corrections.json"

TRACKS = {
    1427: "인문",
    7517: "예체능", 7518: "자연", 7519: "인문", 7520: "인문", 7522: "의약학",
    7526: "인문", 7527: "인문", 7529: "의약학",
    7588: "인문", 7589: "자연", 7600: "인문", 7630: "예체능", 7634: "예체능",
    7650: "인문", 7656: "자연", 7683: "예체능", 7687: "예체능", 7688: "인문", 7689: "자연",
    7714: "인문", 7736: "인문", 7737: "인문", 7738: "인문", 7743: "예체능", 7745: "인문",
    9938: "예체능",
    11860: "예체능", 11872: "인문", 11891: "예체능", 11894: "예체능", 11908: "인문",
    12740: "통합",
    14698: "자연", 14699: "자연", 14750: "자연", 14751: "자연",
    17569: "예체능",
    19912: "인문", 19965: "인문", 19972: "통합", 20028: "통합",
}


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    changes: list[dict] = []
    for row in payload["scores"]:
        track = TRACKS.get(int(row["id"]))
        if not track or row.get("t") == track:
            continue
        changes.append(
            {
                "id": row["id"],
                "university": row["u"],
                "year": row["y"],
                "department": row["d"],
                "field": "t",
                "before": row.get("t"),
                "after": track,
                "reason": "모집단위 명칭과 공식 계열 구분으로 보정",
            }
        )
        row["t"] = track

    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    AUDIT_PATH.write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"corrected": len(changes)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
