from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "track-corrections.json"

TRACKS = {
    1022: "자연", 1053: "자연", 1083: "자연",
    1427: "인문", 1476: "인문", 1517: "인문",
    3836: "자연", 3867: "자연",
    4105: "자연", 4119: "자연", 4130: "자연",
    7070: "자연", 7095: "자연", 7113: "자연", 7339: "자연",
    7517: "예체능", 7518: "자연", 7519: "인문", 7520: "인문", 7522: "의약학",
    7526: "인문", 7527: "인문", 7529: "의약학",
    7588: "인문", 7589: "자연", 7600: "인문", 7630: "예체능", 7634: "예체능",
    7650: "인문", 7656: "자연", 7683: "예체능", 7687: "예체능", 7688: "인문", 7689: "자연",
    7714: "인문", 7736: "인문", 7737: "인문", 7738: "인문", 7743: "예체능", 7745: "인문",
    8044: "자연", 8065: "자연",
    8761: "자연", 8813: "자연",
    8990: "자연", 9018: "자연", 9045: "자연",
    9593: "인문", 9728: "자연",
    9938: "예체능",
    11860: "예체능", 11872: "인문", 11891: "예체능", 11894: "예체능", 11908: "인문",
    12740: "통합", 12747: "인문", 13655: "자연", 13669: "자연", 13684: "자연",
    14698: "자연", 14699: "자연", 14750: "자연", 14751: "자연",
    14904: "자연", 14945: "자연", 14979: "자연",
    15301: "자연", 15386: "자연", 15448: "자연",
    16018: "인문", 16381: "인문", 16450: "인문", 16816: "자연", 16827: "자연", 17569: "예체능",
    19912: "인문", 19965: "인문", 19972: "통합", 20028: "통합", 20127: "자연", 20160: "자연",
    20499: "자연", 20533: "자연",
}

HEALTH_NATURAL = re.compile(r"간호|임상병리|물리치료|작업치료|치위생|방사선|응급구조|재활치료|언어치료|청각재활")
CORE_MEDICAL = re.compile(r"의예|치의예|치의학|한의예|한의학|약학|제약학|수의예|수의학|의과대학")
ARTS = re.compile(r"예체능|미술|디자인|음악|성악|작곡|피아노|관현악|무용|체육|스포츠|연극|영화|공연|조형|회화|공예|사진|웹툰|만화|애니메이션|뷰티|패션|실용음악|골프|태권도|경호|레저")
NATURAL = re.compile(r"자연|공학|과학|수학|통계|물리|화학|생명|환경|컴퓨터|소프트웨어|ai|인공지능|데이터|반도체|전자|기계|건축|토목|항공|산업|식품|에너지|스마트|첨단|it|ict")


def normalized_track(row: dict) -> str:
    department = re.sub(r"\s+", "", str(row.get("d") or "")).lower()
    explicit = TRACKS.get(int(row["id"]))
    if explicit in {"인문", "자연", "예체능", "의약학"}:
        return explicit
    if HEALTH_NATURAL.search(department):
        return "자연"
    if CORE_MEDICAL.search(department) or re.fullmatch(r"의학과|의학부", department):
        return "의약학"
    if ARTS.search(department):
        return "예체능"
    current = str(row.get("t") or "")
    if current in {"인문", "자연", "예체능", "의약학"}:
        return current
    if NATURAL.search(department) or re.search(r"공과대|과학기술대|과학기술원", str(row.get("u") or "")):
        return "자연"
    return "인문"


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    changes: list[dict] = []
    for row in payload["scores"]:
        track = normalized_track(row)
        if row.get("t") == track:
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
