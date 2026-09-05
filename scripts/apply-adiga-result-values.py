from __future__ import annotations

import importlib.util
import json
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
CACHE_DIR = ROOT / "audit" / "adiga-results"
AUDIT_MODULE_PATH = ROOT / "scripts" / "audit-official-results.py"
SUMMARY_PATH = ROOT / "audit" / "adiga-result-values-summary.json"
SYNC_FIELDS = ("cv50", "cv70", "p50", "p70")

spec = importlib.util.spec_from_file_location("official_results_audit", AUDIT_MODULE_PATH)
if spec is None or spec.loader is None:
    raise SystemExit("대학어디가 결과 검사 모듈을 읽을 수 없습니다.")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def exam_variant(value: str) -> int:
    compact = audit.clean(value)
    if any(token in compact for token in ("일반전형2", "일반학생2", "일반2")):
        return 2
    if any(token in compact for token in ("일반전형3", "일반학생3", "일반3")):
        return 3
    return 1 if "일반" in compact or "정시" in compact else 0


def official_rows_for_pair(pair: tuple[str, str], cache: dict[tuple[str, str], list[dict]]) -> list[dict]:
    if pair in cache:
        return cache[pair]
    code, source_year = pair
    path = CACHE_DIR / f"{source_year}-{code}.html"
    rows = audit.parse_official(path.read_text(encoding="utf-8")) if path.is_file() else []
    cache[pair] = rows
    return rows


def local_value_available(field: str, value: object) -> bool:
    if value is None:
        return False
    if field in ("p50", "p70"):
        return isinstance(value, (int, float)) and 0 <= value <= 100
    return isinstance(value, (int, float))


payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
for row in payload.get("scores", []):
    original = row.pop("resultValueOriginal", None)
    if isinstance(original, dict):
        for field, value in original.items():
            row[field] = value
    row.pop("resultValueSource", None)
parsed_cache: dict[tuple[str, str], list[dict]] = {}
field_counts = defaultdict(int)
matched_rows = 0
unmatched_rows = 0

for local in payload.get("scores", []):
    pair = audit.source_pair(local)
    if pair is None:
        continue
    official_rows = official_rows_for_pair(pair, parsed_cache)
    group = audit.admission_group(local.get("g") or local.get("a", ""))
    candidates = [
        row
        for row in official_rows
        if audit.admission_group(row.get("a", "")) == group
        and audit.department_similarity(local.get("d", ""), row.get("d", "")) >= 0.94
    ]
    local_variant = exam_variant(local.get("exam") or local.get("a", ""))
    variant_matches = [row for row in candidates if exam_variant(row.get("exam", "")) == local_variant]
    if variant_matches:
        candidates = variant_matches
    if not candidates:
        if any(not local_value_available(field, local.get(field)) for field in SYNC_FIELDS):
            unmatched_rows += 1
        continue
    official = min(candidates, key=lambda row: audit.candidate_cost(local, row))
    # 동명 모집단위가 여러 전형에 반복될 때 다른 전형의 값을 섞지 않는다.
    # 기존에 공개된 식별 수치가 하나라도 다르면 자동 보완 대상에서 제외한다.
    comparison_fields = ("n", "c", "add", "cv50", "cv70", "p50", "p70")
    if any(
        local_value_available(field, local.get(field))
        and audit.official_value_available(field, official.get(field))
        and not audit.same_number(local.get(field), official.get(field))
        for field in comparison_fields
    ):
        if any(not local_value_available(field, local.get(field)) for field in SYNC_FIELDS):
            unmatched_rows += 1
        continue
    changed = False
    original: dict[str, object] = {}
    for field in SYNC_FIELDS:
        value = official.get(field)
        if not local_value_available(field, local.get(field)) and audit.official_value_available(field, value):
            original[field] = local.get(field)
            local[field] = value
            field_counts[field] += 1
            changed = True
    if changed:
        local["resultValueSource"] = "대학어디가 공개자료"
        local["resultValueOriginal"] = original
        matched_rows += 1

summary = {
    "official_pairs_read": len(parsed_cache),
    "rows_completed": matched_rows,
    "unmatched_rows_with_missing_values": unmatched_rows,
    "fields_completed": {field: field_counts[field] for field in SYNC_FIELDS},
}
DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
