from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
SOURCE_AUDIT_PATH = ROOT / "audit" / "gyeonggi-2027-source-audit.json"
REPORT_PATH = ROOT / "audit" / "gyeonggi-2027-integration-summary.json"
TRACKS = {"인문", "자연", "예체능", "의약학"}
FORBIDDEN_FIELDS = {
    "studentRecord",
    "interview",
    "other",
    "koreanRatio",
    "mathRatio",
    "englishRatio",
    "inquiryRatio",
    "englishMethod",
    "historyMethod",
}
SPECIAL_ADMISSION_PATTERN = re.compile(
    r"특성화|농어촌|기회균형|저소득|재외국민|장애|특수교육대상|북한이탈|만학도|자율전공\s*특별"
)
COMMON_FLEXIBLE_PATTERN = re.compile(
    r"자유전공|자율전공|무전공|전공자유|자유융합"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
source_audit = json.loads(SOURCE_AUDIT_PATH.read_text(encoding="utf-8"))
units = data.get("units2027", [])
profiles = data.get("profiles", [])
issues: list[str] = []

expected_units = (
    int(source_audit.get("rawHtmlRows") or 0)
    - int(source_audit.get("excludedSpecialAdmissionRows") or 0)
    - int(
        source_audit.get("ignoredUnsafeFields", {}).get("stageDuplicatesMerged")
        or 0
    )
)
if len(units) != expected_units:
    issues.append(
        f"논리 모집단위 행 수 {len(units)}(예상 {expected_units})"
    )
identifiers = [unit.get("id") for unit in units]
if len(identifiers) != len(set(identifiers)):
    issues.append("모집단위 id 중복")
keys = [
    (
        unit.get("u"),
        unit.get("examName"),
        unit.get("admissionGroup"),
        unit.get("sourceTrack"),
        unit.get("detailedTrack"),
        unit.get("department"),
        unit.get("quota"),
        unit.get("campus"),
    )
    for unit in units
]
if len(keys) != len(set(keys)):
    issues.append("모집단위 복합키 중복")

for unit in units:
    identifier = unit.get("id")
    if unit.get("trackCategory") not in TRACKS:
        issues.append(f"{identifier}행 계열 오류 {unit.get('trackCategory')}")
    track_categories = unit.get("trackCategories") or [unit.get("trackCategory")]
    if not track_categories or not set(track_categories).issubset(TRACKS):
        issues.append(f"{identifier}행 복수 계열 오류 {track_categories}")
    if (
        unit.get("sourceTrack") == "공통"
        and COMMON_FLEXIBLE_PATTERN.search(
            re.sub(
                r"[^0-9A-Za-z가-힣]",
                "",
                f"{unit.get('department', '')} {unit.get('detailedTrack', '')}",
            ).lower()
        )
        and set(track_categories) != {"인문", "자연"}
    ):
        issues.append(f"{identifier}행 공통 자유전공 복수 계열 오류")
    if "간호" in str(unit.get("department")) and "자연" not in track_categories:
        issues.append(f"{identifier}행 간호학 자연계열 분류 오류")
    if re.search(
        r"의예|치의예|치의학|한의예|한의학|약학|제약학|수의예|수의학",
        str(unit.get("department")),
    ) and "의약학" not in track_categories:
        issues.append(f"{identifier}행 의약학 분류 오류")
    if SPECIAL_ADMISSION_PATTERN.search(str(unit.get("examName"))):
        issues.append(f"{identifier}행 특별전형 잔존")
    if unit.get("displayConfirmed") and not (
        unit.get("officialNameConfirmed") or unit.get("historicalNameConfirmed")
    ):
        issues.append(f"{identifier}행 미검증 화면 노출")
    unsafe = FORBIDDEN_FIELDS.intersection(unit)
    if unsafe:
        issues.append(f"{identifier}행 미사용 원자료 필드 잔존: {', '.join(sorted(unsafe))}")
    stages = unit.get("stages") or []
    if not stages or len(stages) != len(set(stages)):
        issues.append(f"{identifier}행 선발 단계 오류")

supplement = data.get("sourceSupplement2027", {})
for source_key, audit_key in (
    ("unitSourceSha256", "htmlSha256"),
    ("directorySourceSha256", "pdfSha256"),
):
    if supplement.get(source_key) != source_audit.get(audit_key):
        issues.append(f"원본 해시 연결 오류: {source_key}")
source_paths = [Path(source_audit["htmlSource"]), Path(source_audit["pdfSource"])]
for path, expected in zip(
    source_paths,
    (source_audit.get("htmlSha256"), source_audit.get("pdfSha256")),
    strict=True,
):
    if not path.exists():
        issues.append(f"원본 파일 없음: {path}")
    elif sha256(path) != expected:
        issues.append(f"원본 해시 변경: {path.name}")

linked_profiles = [profile for profile in profiles if profile.get("sourceLinks2027")]
linked_entries = sum(len(profile.get("sourceLinks2027", [])) for profile in linked_profiles)
if len(linked_profiles) < 200 or linked_entries < 202:
    issues.append(
        f"경기도교육청 링크 연결 부족: 대학 {len(linked_profiles)}, 항목 {linked_entries}"
    )
for profile in linked_profiles:
    for entry in profile.get("sourceLinks2027", []):
        if not entry.get("label"):
            issues.append(f"{profile.get('u')} 링크 대학명 누락")
        for key in ("prospectusUrl2027", "adiga2027Url", "admissionUrl"):
            value = entry.get(key)
            parsed = urlparse(str(value)) if value else None
            if value and (
                parsed is None
                or parsed.scheme not in {"http", "https"}
                or not parsed.netloc
            ):
                issues.append(f"{profile.get('u')} {key} URL 오류")

summary = {
    "rawRows": source_audit.get("rawHtmlRows"),
    "logicalRows": len(units),
    "confirmedRows": sum(bool(unit.get("displayConfirmed")) for unit in units),
    "quarantinedRows": sum(not unit.get("displayConfirmed") for unit in units),
    "officialNameConfirmed": sum(bool(unit.get("officialNameConfirmed")) for unit in units),
    "historicalNameConfirmed": sum(bool(unit.get("historicalNameConfirmed")) for unit in units),
    "stageRowsMerged": source_audit.get("ignoredUnsafeFields", {}).get("stageDuplicatesMerged"),
    "linkedProfiles": len(linked_profiles),
    "linkedDirectoryEntries": linked_entries,
    "ignoredUnsafeFields": source_audit.get("ignoredUnsafeFields"),
    "issues": len(issues),
    "details": issues,
}
REPORT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
if issues:
    raise SystemExit(1)
