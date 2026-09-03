from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
PROFILE_SCORE_ALIASES = {
    "강원대(강릉원주대)": ["강원대(강릉)", "강원대(원주)"],
    "단국대": ["단국대(죽전)"],
    "상명대": ["상명대(서울)"],
    "차의과학대": ["차의과대"],
    "한국외국어대": ["한국외대", "한국외대(글)"],
}
CODE_OVERRIDES = {
    "영산대": "0003193",
}
DETAIL_URL = (
    "https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do"
    "?menuId=PCUVTINF2000&searchSyr=2027&unvCd={code}"
)


def source_code(source: str | None) -> str | None:
    match = re.search(r"unvCd=(\d+)", source or "")
    return match.group(1) if match else None


data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
scores = data["scores"]
updated = 0
for profile in data["profiles"]:
    code = CODE_OVERRIDES.get(profile["u"]) or source_code(profile.get("resultSource"))
    if not code:
        names = PROFILE_SCORE_ALIASES.get(profile["u"], [profile["u"]])
        codes = {
            candidate
            for score in scores
            if score.get("u") in names
            for candidate in [source_code(score.get("source"))]
            if candidate
        }
        if len(codes) == 1:
            code = next(iter(codes))
    if not code:
        continue
    target = DETAIL_URL.format(code=code)
    if profile.get("resultSource") != target:
        profile["resultSource"] = target
        updated += 1

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(json.dumps({"updated": updated}, ensure_ascii=False))
