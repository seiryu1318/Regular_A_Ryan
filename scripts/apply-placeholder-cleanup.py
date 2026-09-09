from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "placeholder-value-corrections.json"


def add_change(changes: list[dict], row: dict, field: str, reason: str) -> None:
    value = row.get(field)
    if value is None:
        return
    changes.append(
        {
            "id": row["id"],
            "university": row["u"],
            "year": row["y"],
            "department": row["d"],
            "field": field,
            "before": value,
            "after": None,
            "reason": reason,
            "source": row.get("source", ""),
        }
    )
    row[field] = None


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    changes: list[dict] = []

    for row in payload["scores"]:
        original = dict(row)

        # p50/p70 are percentile columns in the 대입정보포털 result table.
        # Values above 100 in portal-linked legacy rows are shifted or
        # non-percentile cells, not standard scores. Keep only an explicitly
        # identified standard-score result published by a university itself.
        source = str(original.get("source") or "").lower()
        metric = str(original.get("metric") or "")
        explicit_official_standard = "표준점수" in metric and "adiga.kr" not in source
        if not explicit_official_standard:
            for field in ("p50", "p70"):
                value = original.get(field)
                if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 100:
                    add_change(changes, row, field, "백분위 항목의 범위 100을 초과한 원자료 값")

        # Some university submissions use 9999 as a missing-value marker.
        for field in ("c", "x", "cv50", "cv70", "p50", "p70"):
            if original.get(field) == 9999:
                add_change(changes, row, field, "공식 원자료의 결측 대용값 9999")

        # In the same rows, 99 is paired with 9999 across every score field.
        if original.get("cv50") == 9999 and original.get("cv70") == 9999:
            for field in ("p50", "p70"):
                if original.get(field) == 99:
                    add_change(changes, row, field, "환산점수 9999와 함께 입력된 결측 대용값 99")

        # A repeated 1 in both cut scores and the only supplied subject score is
        # a portal submission placeholder, not a usable percentile/grade result.
        p50 = original.get("p50")
        p70 = original.get("p70")
        subject_values = [original.get(field) for field in ("ko", "ma", "inq")]
        only_placeholder_subjects = all(value in (None, 1) for value in subject_values)
        if p50 == 1 and p70 == 1 and only_placeholder_subjects:
            add_change(changes, row, "p50", "50%와 70%가 모두 1로 반복된 결측 대용값")
            add_change(changes, row, "p70", "50%와 70%가 모두 1로 반복된 결측 대용값")

        # When both converted scores are 1 and the percentile cell is also 1,
        # the cells form the same missing-value pattern even if only one cut is 1.
        if original.get("cv50") == 1 and original.get("cv70") == 1:
            add_change(changes, row, "cv50", "50%와 70% 환산점수가 모두 1인 결측 대용값")
            add_change(changes, row, "cv70", "50%와 70% 환산점수가 모두 1인 결측 대용값")
            if p50 == 1:
                add_change(changes, row, "p50", "환산점수 결측 패턴과 함께 입력된 값 1")
            if p70 == 1:
                add_change(changes, row, "p70", "환산점수 결측 패턴과 함께 입력된 값 1")

    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    AUDIT_PATH.write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"changed_fields": len(changes), "changed_rows": len({item['id'] for item in changes})}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
