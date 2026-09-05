from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
OUTPUT_PATH = ROOT / "audit" / "historical-methods-audit.json"
MEDICAL_UNIT_KEYS = (
    "의예", "의학", "치의", "한의", "약학", "수의", "간호", "임상병리",
    "물리치료", "작업치료", "치위생", "방사선", "응급구조",
)
CORE_MEDICAL = re.compile(r"의예|의학|치의|한의|약학|제약학|수의")
HEALTH_NATURAL = re.compile(r"간호|임상병리|물리치료|작업치료|치위생|방사선|응급구조|재활치료|언어치료|청각재활")
ARTS = re.compile(r"미술|디자인|음악|성악|작곡|피아노|관현악|무용|체육|스포츠|연극|영화|공연|조형|회화|공예|사진|웹툰|만화|애니메이션")
HUMANITIES = re.compile(r"국어|문예|영어영문|철학|역사|어문|문화|언어|문학|정치|행정|공공|문헌정보|미디어|언론|사회|심리|도시|부동산|복지|경영|경제|무역|회계|금융|교육")


def admission_groups(value: str) -> set[str]:
    groups: set[str] = set()
    normalized = re.sub(r"[^0-9A-Za-z가-힣]", "", value or "").lower()
    for marker, group in (("㉮", "가"), ("㉯", "나"), ("㉰", "다")):
        if marker in (value or ""):
            groups.add(group)
    for match in re.finditer(r"([가나다]{1,3})군", normalized):
        groups.update(match.group(1))
    for match in re.finditer(r"(?<![가-힣])([가나다](?:\s*[/,·]\s*[가나다]){1,2})(?![가-힣])", value or ""):
        groups.update(re.findall(r"[가나다]", match.group(1)))
    for match in re.finditer(
        r"(?:^|[^가-힣])([가나다])\s*(?=전\s*모집단위|일반(?:학생|전형)|모집군)",
        value or "",
    ):
        groups.add(match.group(1))
    leading_group = re.match(r"^\s*([가나다])\s+(?=[0-9A-Za-z가-힣])", re.sub(r"\s+", " ", value or "").strip())
    if leading_group:
        groups.add(leading_group.group(1))
    return groups


def canonical_unit(value: str) -> str:
    normalized = re.sub(r"[^0-9A-Za-z가-힣]", "", value or "").lower()
    return (
        normalized
        .replace("자유전공학융합학부", "자유전공융합학부")
        .replace("자율전공학융합학부", "자유전공융합학부")
        .replace("자율전공융합학부", "자유전공융합학부")
    )


def score_track(score: dict) -> str:
    department = canonical_unit(str(score.get("d") or ""))
    if HEALTH_NATURAL.search(department):
        return "자연"
    if CORE_MEDICAL.search(department):
        return "의약학"
    if ARTS.search(department):
        return "예체능"
    declared = str(score.get("t") or "")
    return declared if declared in {"인문", "자연", "예체능", "의약학"} else "인문"


def is_generic_scope(value: str) -> bool:
    normalized = re.sub(r"[^0-9A-Za-z가-힣]", "", value or "").lower()
    qualifier = re.compile(
        r"(?:인문|사회|경영|상경|어문|자연|공학|이공|수리|과학|공과|"
        r"예체능|예술|체육|의약학|의학|의예|치의|한의|약학|수의|간호|"
        r"보건|의료|사범|교육|생활|[0-9A-Za-z가-힣]+(?:대학|계열))$"
    )
    for marker in ("전모집단위", "전체모집단위", "모든모집단위"):
        start = 0
        while (index := normalized.find(marker, start)) >= 0:
            if not qualifier.search(normalized[max(0, index - 42) : index]):
                return True
            start = index + len(marker)
    return bool(re.search(r"(?:전계열|모든계열|공통)$", normalized))


def scoped_scope_phrases(value: str) -> list[str]:
    text = re.sub(r"\s+", " ", value or "").strip()
    phrases: list[str] = []
    for match in re.finditer(r"(?:전|전체)\s*모집단위", text):
        prefix = text[max(0, match.start() - 55) : match.start()]
        prefix = re.split(r"(?:^|\s)\d+\s*[).]|[,;/]", prefix)[-1].strip()
        if prefix and re.search(r"인문|사회|경영|상경|어문|자연|공학|이공|수리|과학|공과|예체|예술|체육|의약|의학|의예|치의|한의|약학|수의|간호|보건|의료|사범|교육|생활|대학|계열", prefix):
            phrases.append(prefix)
    return phrases


def scope_phrase_matches(department: str, track: str, phrase: str) -> bool:
    scope = canonical_unit(phrase)
    if re.search(r"예체|예술|체육", scope):
        return track == "예체능" or bool(ARTS.search(department))
    if re.search(r"의약|의학|의예|치의|한의|약학|수의|간호|보건|의료", scope):
        return bool(medical_unit_types(scope).intersection(medical_unit_types(department))) or track == "의약학"
    if re.search(r"사범|교육", scope):
        return bool(re.search(r"교육과|교육학|사범", department))
    if re.search(r"인문|사회|경영|상경|어문", scope):
        return track == "인문"
    if re.search(r"자연|공학|이공|수리|과학|공과", scope):
        return track == "자연" and not bool(ARTS.search(department))
    if "생활" in scope:
        return bool(re.search(r"생활|식품|의류|아동|주거|소비자", department))
    return False


def medical_unit_types(value: str) -> set[str]:
    normalized = re.sub(r"[^0-9A-Za-z가-힣]", "", value or "").lower().replace("의약학", "")
    patterns = (
        ("치의", r"치의"), ("한의", r"한의"), ("수의", r"수의"),
        ("의학", r"(?<![한치수])의예|(?<![한치수])의학"),
        ("약학", r"약학"), ("간호", r"간호"), ("임상병리", r"임상병리"),
        ("물리치료", r"물리치료"), ("작업치료", r"작업치료"),
        ("치위생", r"치위생"), ("방사선", r"방사선"), ("응급구조", r"응급구조"),
    )
    return {name for name, pattern in patterns if re.search(pattern, normalized)}


def specific_units(value: str) -> list[str]:
    scope = (value or "").split("제외", 1)[0]
    return [
        re.sub(r"[^0-9A-Za-z가-힣]", "", match).lower()
        for match in re.findall(r"(?:^|[\s,/(])([^,;/()]{1,40}?(?:학과|학부|전공|예과|교육과))(?=$|[\s,/)])", scope)
    ]


def specific_unit_matches(department: str, unit: str, target: str) -> bool:
    canonical_department = canonical_unit(department)
    canonical_specific = canonical_unit(unit)
    canonical_target = canonical_unit(target)
    if canonical_specific and (canonical_specific in canonical_department or canonical_department in canonical_specific or canonical_department in canonical_target):
        return True
    department_units = re.findall(
        r"[0-9A-Za-z가-힣]{2,}?(?:교육과|학과|학부|전공|예과)", department
    )
    if any(len(candidate) >= 4 and (candidate in unit or unit.endswith(candidate)) for candidate in department_units):
        return True
    suffix = r"(?:학과|학부|전공|예과|교육과)$"
    department_stem = re.sub(suffix, "", department)
    unit_stem = re.sub(suffix, "", unit)
    if len(department_stem) >= 3 and department_stem == unit_stem:
        return True
    target_keys = medical_unit_types(target)
    department_keys = medical_unit_types(department)
    return bool(target_keys.intersection(department_keys))


def department_variant_conflicts(department_value: str, target: str) -> bool:
    raw_department = re.sub(r"\s+", " ", department_value or "").strip()
    department = canonical_unit(raw_department)
    target = canonical_unit(target)
    if not department:
        return False
    department_variant = "자연" if re.search(r"(?:자연계열|자연|과학기술)$", department) else "인문" if re.search(r"(?:인문계열|인문|인문사회계열|인문사회)$", department) else ""
    stripped = re.sub(r"(?:자연계열|인문계열|인문사회계열|인문사회|과학기술|자연|인문)$", "", department)
    parent = canonical_unit(re.split(r"[(_]", raw_department, maxsplit=1)[0])
    qualifiers = [canonical_unit(value) for value in re.findall(r"[(_]([^)_]{2,40})[)_]?", raw_department)]
    bases = [value for value in [stripped, *qualifiers, parent] if len(value) >= 4 and value in target]
    if not bases:
        return False
    base = max(bases, key=len)
    contexts = [target[match.end() : match.end() + 24] for match in re.finditer(re.escape(base), target)]
    if department_variant == "자연" and contexts and all(re.match(r"인문(?:계열|사회)?", context) for context in contexts):
        return True
    if department_variant == "인문" and contexts and all(re.match(r"자연(?:계열)?|과학기술", context) for context in contexts):
        return True
    distinctive = [value for value in qualifiers if value not in {"인문", "자연", "인문계열", "자연계열", "인문사회", "인문사회계열"}]
    target_has_qualifier = any(re.search(r"자유전공|자율전공|글로벌|공공정책|과학기술|인문사회", context) for context in contexts)
    return bool(distinctive and contexts and target_has_qualifier and not any(any(value in context for value in distinctive) for context in contexts))


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    issues: list[dict[str, object]] = []
    connected = 0
    for score in data.get("scores", []):
        method = score.get("yearMethod")
        if not method:
            continue
        connected += 1
        year = int(score.get("y") or 0)
        target = str(method.get("target") or "")
        compact_target = re.sub(r"\s+", "", target).lower()
        department = re.sub(r"\s+", "", str(score.get("d") or "")).lower()
        source = str(method.get("source") or "")
        labels = method.get("labels") or {}
        if method.get("year") != year or f"searchSyr={year}" not in source:
            issues.append({"id": score.get("id"), "kind": "학년도", "university": score.get("u")})
        target_groups = admission_groups(target)
        score_groups = admission_groups(f"{score.get('g') or ''}군")
        if target_groups and score_groups and not target_groups.intersection(score_groups):
            issues.append({"id": score.get("id"), "kind": "모집군", "university": score.get("u")})
        track = score_track(score)
        semantic_target = canonical_unit(target)
        semantic_department = canonical_unit(str(score.get("d") or ""))
        scope_override = bool(
            semantic_department and semantic_department in semantic_target
            or medical_unit_types(semantic_target).intersection(medical_unit_types(semantic_department))
        )
        track_conflict = (
            not scope_override and track == "의약학" and bool(re.search(r"인문|사회|경영|상경|어문|예체|예술|체육", compact_target))
            or not scope_override and track == "의약학" and bool(re.search(r"자연|공학|이공|수리", compact_target)) and not medical_unit_types(compact_target)
            or not scope_override and track == "예체능" and bool(re.search(r"인문|사회|경영|상경|어문|자연|공학|이공|수리|의예|치의|한의|약학|수의", compact_target)) and not bool(re.search(r"예체|예술|체육|디자인|미술|음악|스포츠|연극|영화", compact_target))
            or not scope_override and track == "인문" and bool(re.search(r"자연|공학|이공|수리|의예|치의|한의|약학|수의|예체|예술|체육", compact_target))
            or not scope_override and track == "자연" and bool(re.search(r"인문|사회|경영|상경|어문|예체|예술|체육", compact_target)) and not bool(re.search(r"자연|공학|이공|수리", compact_target))
        )
        if track_conflict:
            issues.append({"id": score.get("id"), "kind": "계열", "university": score.get("u"), "department": score.get("d"), "target": target})
        if department_variant_conflicts(str(score.get("d") or ""), target):
            issues.append({"id": score.get("id"), "kind": "모집단위 구분", "university": score.get("u"), "department": score.get("d"), "target": target})
        generic_scope = is_generic_scope(target)
        target_medical_units = medical_unit_types(compact_target)
        department_medical_units = medical_unit_types(department)
        units = specific_units(target)
        matched_specific_unit = any(specific_unit_matches(department, unit, compact_target) for unit in units)
        scopes = scoped_scope_phrases(target.split("제외", 1)[0])
        matched_scope = any(scope_phrase_matches(department, track, phrase) for phrase in scopes)
        if target_medical_units and not generic_scope and not matched_specific_unit and not target_medical_units.intersection(department_medical_units):
            issues.append({
                "id": score.get("id"),
                "kind": "의약학 모집단위",
                "university": score.get("u"),
                "department": score.get("d"),
                "target": target,
            })
        if (units or scopes) and not generic_scope and not (matched_specific_unit or matched_scope):
            issues.append({
                "id": score.get("id"),
                "kind": "모집단위",
                "university": score.get("u"),
                "department": score.get("d"),
                "target": target,
            })
        fixed: list[float] = []
        has_selection = bool(re.search(r"상위|우수|선택|택\s*\d|또는", target))
        for domain, label in labels.items():
            text = str(label)
            matches = list(re.finditer(r"(\d+(?:\.\d+)?)\s*%", text))
            for match in matches:
                value_text = match.group(1)
                decimals = value_text.split(".", 1)[1] if "." in value_text else ""
                if float(value_text) > 100 or len(decimals) > 2:
                    issues.append({"id": score.get("id"), "kind": "비율", "domain": domain, "value": text})
            if len(matches) > 1 and any(float(match.group(1)) <= 5 for match in matches[1:]):
                issues.append({"id": score.get("id"), "kind": "탐구 과목 수", "domain": domain, "value": text})
            if len(matches) > 1 and any(float(match.group(1)) == 100 for match in matches):
                issues.append({"id": score.get("id"), "kind": "합계 비율 혼입", "domain": domain, "value": text})
            if len(matches) == 1 and not re.search(r"상위|우수|선택|\(|/", text):
                fixed.append(float(matches[0].group(1)))
        if not has_selection and len(fixed) >= 2 and sum(fixed) > 101:
            issues.append({"id": score.get("id"), "kind": "고정비율 합계", "value": round(sum(fixed), 4)})

    summary = {
        "score_rows": len(data.get("scores", [])),
        "connected_rows": connected,
        "unconnected_rows": len(data.get("scores", [])) - connected,
        "issues": len(issues),
        "examples": issues[:100],
    }
    OUTPUT_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
