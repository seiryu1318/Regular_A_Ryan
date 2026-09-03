"""유원대 2025 정시 결과의 열 밀림을 공식 공개 결과로 교정한다."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
AUDIT_PATH = ROOT / "audit" / "u1-2025-official-corrections.json"
OFFICIAL_URL = (
    "https://ipsi.u1.ac.kr/ipsi/data/result.do?"
    "article.offset=0&articleLimit=10&articleNo=25934&mode=view"
)

# 유원대 입학처가 공개한 2025학년도 정시 결과표의 1000점 기준 70% 컷.
# 현재 데이터의 ID를 사용해 학과명 표기 차이와 인코딩 환경에 영향을 받지 않게 한다.
OFFICIAL_70_BY_ID = {
    14631: 655,  # AI소프트웨어학과
    14632: 663,  # 간호학과
    14633: 645,  # 경찰 소방행정학부
    14634: 740,  # 국방인재개발학과
    14635: 510,  # 드론로봇응용학과
    14636: 545,  # 문화복지융합학과
    14637: 731,  # 물리치료학과
    14638: 640,  # 미디어콘텐츠학과
    14640: 655,  # 미래자동차학과
    14641: 585,  # 뷰티케어학과
    14642: 640,  # 사회복지학부
    14643: 620,  # 산업안전보건학과
    14644: 585,  # 스마트팜학과
    14646: 585,  # 스포츠학부
    14647: None,  # 와인사이언스학과: 공식 결과표 성적 공란
    14648: 480,  # 유아교육과
    14649: 595,  # 응급구조학과
    14650: 645,  # 자율설계학부
    14651: 695,  # 작업치료학과
    14652: 545,  # 중등특수교육과
    14653: 670,  # 창의설계학부
    14654: 595,  # 초등특수교육과
    14655: 665,  # 치위생학과
    14656: 620,  # 호텔외식조리학과
}

OFFICIAL_OMITTED_IDS = {14639, 14645}
ADIGA_PERCENTILE_70_BY_ID = {
    14632: 63.5,
    14637: 72.8,
    14655: 65.0,
}


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    changes: list[dict[str, object]] = []

    for row in data["scores"]:
        row_id = row.get("id")
        if row_id not in OFFICIAL_70_BY_ID and row_id not in OFFICIAL_OMITTED_IDS:
            continue

        before = {
            key: row.get(key)
            for key in ("cv50", "cv70", "max", "p50", "p70", "admission", "missingReason")
        }

        # 대학어디가 표에는 50% 환산점수 열이 없다. 기존 값은 충원순위가
        # 50% 환산점수로 밀려 들어간 것이므로 전부 제거한다.
        row["cv50"] = None
        row["p50"] = None
        row["admission"] = OFFICIAL_URL

        if row_id in OFFICIAL_OMITTED_IDS:
            row["cv70"] = None
            row["max"] = None
            row["p70"] = None
            row["missingReason"] = "대학 입학처 공개 결과표에 해당 모집단위 성적 미기재"
        else:
            row["cv70"] = OFFICIAL_70_BY_ID[row_id]
            row["max"] = 1000
            row["p70"] = ADIGA_PERCENTILE_70_BY_ID.get(row_id)
            if row_id == 14647:
                row["missingReason"] = "대학 입학처 공개 결과표 성적 공란"
            else:
                row.pop("missingReason", None)

        after = {
            key: row.get(key)
            for key in ("cv50", "cv70", "max", "p50", "p70", "admission", "missingReason")
        }
        changes.append({"id": row_id, "university": row.get("u"), "department": row.get("d"), "before": before, "after": after})

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    AUDIT_PATH.write_text(
        json.dumps(
            {
                "officialSource": OFFICIAL_URL,
                "adigaSource": "https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&searchSyr=2026&unvCd=0000154",
                "correctionCount": len(changes),
                "changes": changes,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"corrected {len(changes)} U1 rows")


if __name__ == "__main__":
    main()
