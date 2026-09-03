from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
REPORT_PATH = ROOT / "audit" / "consistency-corrections.json"


def number(value):
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        match = re.search(r"\d+(?:\.\d+)?", value.replace(",", ""))
        return float(match.group()) if match else None
    return None


data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
changes = []

for row in data["scores"]:
    if row["id"] == 8119 and row.get("cv70") != 548.75:
        changes.append({"id": row["id"], "field": "cv70", "before": row.get("cv70"), "after": 548.75, "reason": "대학어디가 원문 오탈자를 대학 공식 2024 입시결과와 원본 엑셀로 교차 확인"})
        row["cv70"] = 548.75

    maximum = number(row.get("max"))
    converted = [number(row.get("cv50")), number(row.get("cv70"))]
    highest = max((value for value in converted if value is not None), default=None)
    copied_cutoff = row["u"] == "우송대" and row["y"] == 2024 and maximum is not None
    shifted_columns = row["u"] == "우석대" and row["y"] == 2025 and maximum is not None
    below_published_score = maximum is not None and highest is not None and highest > maximum * 1.05
    if copied_cutoff or shifted_columns or below_published_score:
        reason = "환산 70% 값이 만점 칸에 중복 입력됨" if copied_cutoff else "백분위 값이 만점 칸에 입력됨" if shifted_columns else "공개 환산점수가 기재 만점을 초과함"
        changes.append({"id": row["id"], "field": "max", "before": row.get("max"), "after": None, "reason": reason})
        row["max"] = None

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
REPORT_PATH.write_text(json.dumps(changes, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"corrected_fields": len(changes), "corrected_rows": len({item['id'] for item in changes})}, ensure_ascii=False))
