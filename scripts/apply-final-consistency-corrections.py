from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "final-consistency-corrections.json"

# 대학어디가 공식 화면에서도 백분위 범위를 벗어나거나 환산점수와 같은 값으로
# 올라온 항목이다. 신뢰할 수 있는 백분위로 재계산할 근거가 없어 숨긴다.
INVALID_PERCENTILE_IDS = {
    7273,
    7274,
    7275,
    7277,
    7279,
    7281,
    7282,
    17538,
    17542,
}
NUMERIC_FIELDS = ("n", "c", "x", "add", "cv50", "cv70", "max", "p50", "p70", "ko", "ma", "inq", "en")


def normalize_numeric(value):
    if not isinstance(value, str):
        return value
    text = value.replace("\u00a0", " ").strip()
    if not text or text in {"-", "—", "#VALUE!", "비공개", "등록자 없음"}:
        return None
    cleaned = text.replace(",", "").replace("점", "").strip()
    if not re.fullmatch(r"-?\d+(?:\.\d+)?", cleaned):
        return None
    parsed = float(cleaned)
    return int(parsed) if parsed.is_integer() else parsed


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    existing = json.loads(AUDIT_PATH.read_text(encoding="utf-8")) if AUDIT_PATH.exists() else []
    changes: list[dict] = list(existing)
    existing_keys = {(int(item["id"]), item["field"], str(item.get("before"))) for item in existing}
    for row in payload["scores"]:
        row_id = int(row["id"])
        for field in NUMERIC_FIELDS:
            before = row.get(field)
            after = normalize_numeric(before)
            if before == after:
                continue
            key = (row_id, field, str(before))
            if key not in existing_keys:
                changes.append(
                    {
                        "id": row_id,
                        "university": row.get("u"),
                        "department": row.get("d"),
                        "field": field,
                        "before": before,
                        "after": after,
                        "reason": "수치형 문자열 또는 결측 표기를 정규화",
                    }
                )
                existing_keys.add(key)
            row[field] = after
        if row_id in INVALID_PERCENTILE_IDS and row.get("p70") not in (None, ""):
            changes.append(
                {
                    "id": row_id,
                    "university": row.get("u"),
                    "department": row.get("d"),
                    "field": "p70",
                    "before": row.get("p70"),
                    "after": None,
                    "reason": "공식 포털의 백분위 범위 오류 또는 환산점수 중복 입력",
                }
            )
            row["p70"] = None
        if row_id == 16108 and row.get("g") != "나":
            changes.append(
                {
                    "id": row_id,
                    "university": row.get("u"),
                    "department": row.get("d"),
                    "field": "g",
                    "before": row.get("g"),
                    "after": "나",
                    "reason": "전형명과 공식 2025 정시 결과에서 나군 확인",
                }
            )
            row["g"] = "나"

    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    AUDIT_PATH.write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"changes": len(changes)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
