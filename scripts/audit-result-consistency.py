from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
SUMMARY_PATH = ROOT / "audit" / "result-consistency-summary.json"
DETAIL_PATH = ROOT / "audit" / "result-consistency-issues.json"
SPECIAL_ADMISSION = re.compile(
    r"특성화|농어촌|지역(?:인재|균형|기회|메디|전형)|강원인재|기회균형|기회균등|"
    r"저소득|차상위|수급|사회(?:적)?배려|특수교육|장애인|성인학습|재직자|군위탁|"
    r"정원외|서해5도|고른기회|계약학과|기독교전형|군사학과전형|국방.*전형|"
    r"사이버국방|항공시스템공학.*특별|자율전공\s*특별"
)


def numeric(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    rows = payload["scores"]
    issues: list[dict] = []

    ids = [int(row["id"]) for row in rows]
    for row_id, count in Counter(ids).items():
        if count > 1:
            issues.append({"id": row_id, "type": "중복 ID", "value": count})

    allowed_tracks = {"인문", "자연", "의약학", "예체능"}
    allowed_groups = {"가", "나", "다"}
    for row in rows:
        for field in ("n", "c", "x", "add", "cv50", "cv70", "max", "p50", "p70"):
            value = row.get(field)
            if numeric(value) and value < 0:
                issues.append({"id": row["id"], "type": "음수", "field": field, "value": value})
        if row.get("g") not in allowed_groups:
            issues.append({"id": row["id"], "type": "모집군", "value": row.get("g")})
        if row.get("t") not in allowed_tracks:
            issues.append({"id": row["id"], "type": "계열", "value": row.get("t")})
        if row.get("y") not in {2024, 2025, 2026}:
            issues.append({"id": row["id"], "type": "연도", "value": row.get("y")})
        if SPECIAL_ADMISSION.search(f"{row.get('exam') or ''} {row.get('a') or ''}"):
            issues.append({"id": row["id"], "type": "특별전형 잔존", "value": row.get("exam") or row.get("a")})
        # 대학어디가 표에 50% 열이 없는 대학을 고정 열로 읽을 때 충원순위가
        # 환산 50%로 밀려 들어가는 오류를 잡는다. 0은 실제 점수일 수 있어 제외한다.
        if numeric(row.get("cv50")) and numeric(row.get("add")) and row["cv50"] != 0 and row["cv50"] == row["add"]:
            issues.append({"id": row["id"], "type": "환산 50%와 충원순위 중복", "value": row["cv50"]})
        # 원 경쟁률은 한 자리 또는 두 자리 반올림값이고 실질경쟁률은 더 많은
        # 자릿수로 계산된 경우가 있어 0.05 이내 차이는 반올림으로 본다.
        if numeric(row.get("x")) and numeric(row.get("c")) and row["x"] > row["c"] + 0.051:
            issues.append({"id": row["id"], "type": "실질경쟁률 초과", "competition": row["c"], "actual": row["x"]})
        maximum = row.get("max")
        if numeric(maximum):
            for field in ("cv50", "cv70"):
                value = row.get(field)
                # 대학별 가산점을 더한 환산점수는 명목상 만점을 소폭 넘을 수 있다.
                if numeric(value) and value > maximum * 1.051:
                    issues.append({"id": row["id"], "type": "환산만점 초과", "field": field, "value": value, "maximum": maximum})
        if "백분위" in str(row.get("metric") or ""):
            for field in ("p50", "p70"):
                value = row.get(field)
                if numeric(value) and value > 100:
                    issues.append({"id": row["id"], "type": "백분위 범위", "field": field, "value": value})

    summary = {
        "rows": len(rows),
        "unique_ids": len(set(ids)),
        "issues": len(issues),
        "by_type": dict(Counter(item["type"] for item in issues)),
    }
    SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    DETAIL_PATH.write_text(json.dumps(issues, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
