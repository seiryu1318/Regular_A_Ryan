from __future__ import annotations

import json
import math
import os
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
CACHE_DIR = ROOT / "audit" / "adiga-historical-methods"
SUMMARY_PATH = ROOT / "audit" / "historical-methods-summary.json"
DETAIL_URL = (
    "https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do"
    "?menuId=PCUVTINF2000&searchSyr={year}&unvCd={code}"
)

SPECIAL_EXAM = re.compile(
    r"농어촌|특성화|기초생활|차상위|기회균형|지역인재|지역기회|재직자|만학도|"
    r"장애|특수교육|서해5도|북한이탈|성인학습|외국인|선취업"
)
MEDICAL = re.compile(r"의예|의학|치의|한의|약학|수의|간호|임상병리|물리치료|작업치료|치위생|방사선|응급구조|보건|의료")
CORE_MEDICAL = re.compile(r"의예|의학|치의|한의|약학|제약학|수의")
HEALTH_NATURAL = re.compile(r"간호|임상병리|물리치료|작업치료|치위생|방사선|응급구조|재활치료|언어치료|청각재활")
MEDICAL_UNIT_KEYS = (
    "의예", "의학", "치의", "한의", "약학", "수의", "간호", "임상병리",
    "물리치료", "작업치료", "치위생", "방사선", "응급구조",
)
ARTS = re.compile(r"미술|디자인|음악|성악|작곡|피아노|관현악|무용|체육|스포츠|연극|영화|공연|조형|회화|공예|사진|웹툰|만화|애니메이션")
NATURAL = re.compile(r"공학|과학|수학|통계|물리|화학|생명|환경|컴퓨터|소프트웨어|ai|인공지능|데이터|반도체|전자|기계|건축|토목|항공|식품|에너지")
HUMANITIES = re.compile(r"국어|문예|영어영문|철학|역사|어문|문화|언어|문학|정치|행정|공공|문헌정보|미디어|언론|사회|심리|도시|부동산|복지|경영|경제|무역|회계|금융|교육")

# 전수감사에서 모집단위·계열·전형 범위 오연결이 확정된 결과 행입니다.
# 안전한 규칙이 추가 검증될 때까지 추론값을 노출하지 않습니다.
KNOWN_UNSAFE_IDS = {
    242, 298, 299, 305, 313, 314, 325, 327, 341, 343, 2853, 3854,
    4053, 4516, 4524, 4536, 4540, 4565, 4573, 4580, 4582,
    6205, 6211, 6218, 6267, 6273, 6281, 6330, 6333, 6339,
    6799, 7113, 7744, 7804, 7879, 7880, 7934, 7958, 8121, 8142,
    9456, 9457, 9562, 9563, 9593, 9726, 9727,
    10410, 10411, 10416, 10417, 10418, 10422, 10424,
    10450, 10451, 10456, 10457, 10458, 10462, 10464,
    10474, 10476, 10478, 10479, 10490, 10497, 10498,
    10504, 10505, 10506, 10510, 10522, 10524, 10526, 10527,
    12592, 12740, 12747,
    12807, 12817, 12825, 12837, 12841, 12843, 12844, 12857,
    13161, 13197, 13232,
    13673, 13688, 13718, 13788, 13856, 14062, 14075,
    15281, 15286,
    15342, 15343, 15348, 15353, 15360, 15365, 15367, 15370,
    15375, 15381, 15383, 15387, 15391, 15394, 15395, 15396,
    15402, 15403, 15408, 15414, 15415, 15422, 15427, 15430,
    15433, 15437, 15443, 15445, 15450, 15454, 15457, 15458, 15459,
    15998, 16018, 16381, 16450, 19159,
    19471, 19472, 19475, 19476, 19477, 19480, 19481, 19482,
    19486, 19487, 19488, 19492, 19493, 19494, 19495,
    19504, 19509, 19510, 19514, 19515, 19523, 19530,
    19533, 19538, 19539, 19543, 19544, 19552,
    19975, 20127, 20160,
    20499, 20533, 20607, 20612, 20618, 20622, 20628, 20633, 20635,
}


def compact(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣]", "", value or "").lower()


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def source_code(source: str | None) -> str | None:
    match = re.search(r"unvCd=(\d+)", source or "")
    return match.group(1) if match else None


def fetch(pair: tuple[int, str]) -> tuple[int, str, str, str | None]:
    year, code = pair
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{year}-{code}.html"
    refresh = os.environ.get("ADIGA_HISTORICAL_REFRESH") == "1"
    if not refresh and cache.exists() and cache.stat().st_size > 5000:
        return year, code, cache.read_text(encoding="utf-8"), None
    request = urllib.request.Request(
        DETAIL_URL.format(year=year, code=code),
        headers={"User-Agent": "Mozilla/5.0 historical-admissions-method-sync"},
    )
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=50) as response:
                content = response.read().decode("utf-8")
            if len(content) < 5000:
                raise ValueError(f"빈 응답 {len(content)} bytes")
            cache.write_text(content, encoding="utf-8")
            return year, code, content, None
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    return year, code, "", str(last_error)


def regular_section(content: str):
    # Adiga stores an entire editor-generated HTML document inside p#con_41.
    # Parsing the full response first repairs that invalid nesting differently by year,
    # so isolate the embedded document from the raw response before lxml sees it.
    lowered = content.lower()
    marker = re.search(r"id\s*=\s*['\"]con_41['\"]", lowered)
    if not marker:
        return None
    html_start = lowered.find("<html", marker.end())
    html_end = lowered.find("</html>", html_start + 5)
    if html_start < 0 or html_end < 0:
        return None
    body_start = lowered.find("<body", html_start, html_end)
    body_open_end = lowered.find(">", body_start, html_end)
    body_end = lowered.rfind("</body>", body_open_end, html_end)
    if body_start < 0 or body_open_end < 0 or body_end < 0:
        return None
    fragment = content[body_open_end + 1 : body_end]
    parser = html.HTMLParser(recover=True, huge_tree=True)
    return html.fromstring(f"<html><body><div id='regular-root'>{fragment}</div></body></html>", parser=parser).xpath("//*[@id='regular-root']")[0]


def visible_cell_text(cell) -> str:
    visible: list[str] = []
    for node in cell.xpath(".//text()"):
        value = str(node)
        parent = node.getparent()
        ancestors = [parent, *parent.iterancestors()] if parent is not None else []
        if any(getattr(element, "tag", "") == "sup" for element in ancestors):
            continue
        # Several Adiga tables append footnote markers such as 1) in a
        # superscript span. Do not remove a whole header whose paragraph happens
        # to use vertical-align: super as ordinary formatting.
        superscript = any(
            "vertical-align:super" in re.sub(r"\s+", "", (element.get("style") or "").lower())
            for element in ancestors
        )
        if superscript and re.fullmatch(r"\s*(?:\d+\)|[＊*]+)\s*", value):
            continue
        visible.append(value)
    return clean(" ".join(visible))


def expanded_grid(table) -> list[list[str]]:
    rows: list[list[str]] = []
    spans: dict[int, tuple[int, str]] = {}
    for tr in table.xpath(".//tr"):
        row: dict[int, str] = {}
        next_spans: dict[int, tuple[int, str]] = {}
        for column, (remaining, value) in spans.items():
            row[column] = value
            if remaining > 1:
                next_spans[column] = (remaining - 1, value)
        column = 0
        for cell in tr.xpath("./th|./td"):
            while column in row:
                column += 1
            value = visible_cell_text(cell)
            colspan = max(1, int(cell.get("colspan") or 1))
            rowspan = max(1, int(cell.get("rowspan") or 1))
            for offset in range(colspan):
                target = column + offset
                row[target] = value
                if rowspan > 1:
                    next_spans[target] = (rowspan - 1, value)
            column += colspan
        spans = next_spans
        width = max(row, default=-1) + 1
        rows.append([row.get(index, "") for index in range(width)])
    width = max((len(row) for row in rows), default=0)
    return [row + [""] * (width - len(row)) for row in rows]


def header_domain(value: str) -> str | None:
    token = compact(value)
    if not token or "한국사" in token:
        return None
    if "국어" in token:
        return "korean"
    if "수학" in token:
        return "math"
    if "영어" in token:
        return "english"
    if "탐구" in token or token in {"사회", "과학", "직업", "사과", "사과직", "사과탐"}:
        return "inquiry"
    return None


def is_value(value: str) -> bool:
    token = clean(value)
    if compact(token) in {"1과목", "2과목", "소계", "합계", "계"}:
        return False
    return bool(
        re.search(r"\d+(?:\.\d+)?\s*(?:%|점)?", token)
        or re.search(r"상위|우수|택\s*1|선택|가산|감산|환산|등급|미반영", token)
    ) and token not in {"국어", "수학", "영어", "탐구", "사회", "과학", "직업"}


def numeric_value(value: str) -> float | None:
    token = clean(value).replace(",", "")
    if re.fullmatch(r"\(?\s*\d+(?:\.\d+)?\s*(?:점)?\s*\)?", token):
        match = re.search(r"\d+(?:\.\d+)?", token)
        return float(match.group()) if match else None
    return None


def format_percent(value: float) -> str:
    rounded = round(value, 4)
    if math.isclose(rounded, round(rounded), abs_tol=1e-8):
        return f"{int(round(rounded))}%"
    rendered = f"{rounded:.4f}".rstrip("0").rstrip(".")
    return f"{rendered}%"


def admission_groups(value: str) -> set[str]:
    groups: set[str] = set()
    normalized = compact(value)
    for marker, group in (("㉮", "가"), ("㉯", "나"), ("㉰", "다")):
        if marker in (value or ""):
            groups.add(group)
    for match in re.finditer(r"([가나다]{1,3})군", normalized):
        groups.update(match.group(1))
    for match in re.finditer(r"(?<![가-힣])([가나다](?:\s*[/,·]\s*[가나다]){1,2})(?![가-힣])", clean(value)):
        groups.update(re.findall(r"[가나다]", match.group(1)))
    for match in re.finditer(
        r"(?:^|[^가-힣])([가나다])\s*(?=전\s*모집단위|일반(?:학생|전형)|모집군)",
        clean(value),
    ):
        groups.add(match.group(1))
    # 대학어디가 표의 첫 열이 단순히 '가 의료·보건...', '나 수능위주...'
    # 처럼 군 한 글자만 두는 경우가 있다. '가점' 같은 일반 단어와 혼동하지
    # 않도록 행 맨 앞의 한 글자 뒤에 실제 공백이 있는 경우만 모집군으로 본다.
    leading_group = re.match(r"^\s*([가나다])\s+(?=[0-9A-Za-z가-힣])", clean(value))
    if leading_group:
        groups.add(leading_group.group(1))
    return groups


def canonical_unit(value: str) -> str:
    normalized = compact(value)
    return (
        normalized
        .replace("자유전공학융합학부", "자유전공융합학부")
        .replace("자율전공학융합학부", "자유전공융합학부")
        .replace("자율전공융합학부", "자유전공융합학부")
    )


def is_generic_scope(value: str) -> bool:
    """True only for an unqualified whole-university scope.

    '인문계열 전 모집단위' and '예술대학 전 모집단위' are scoped rules,
    not university-wide rules. Treating them as generic was the main source of
    cross-college method leakage.
    """
    normalized = compact(value)
    markers = ("전모집단위", "전체모집단위", "모든모집단위")
    qualifier = re.compile(
        r"(?:인문|사회|경영|상경|어문|자연|공학|이공|수리|과학|공과|"
        r"예체능|예술|체육|의약학|의학|의예|치의|한의|약학|수의|간호|"
        r"보건|의료|사범|교육|생활|[0-9A-Za-z가-힣]+(?:대학|계열))$"
    )
    for marker in markers:
        start = 0
        while (index := normalized.find(marker, start)) >= 0:
            prefix = normalized[max(0, index - 42) : index]
            if not qualifier.search(prefix):
                return True
            start = index + len(marker)
    return bool(re.search(r"(?:전계열|모든계열|공통)$", normalized))


def scoped_scope_phrases(value: str) -> list[str]:
    text = clean(value)
    phrases: list[str] = []
    for match in re.finditer(r"(?:전|전체)\s*모집단위", text):
        prefix = text[max(0, match.start() - 55) : match.start()]
        prefix = re.split(r"(?:^|\s)\d+\s*[).]|[,;/]", prefix)[-1]
        prefix = clean(prefix)
        if prefix and re.search(
            r"인문|사회|경영|상경|어문|자연|공학|이공|수리|과학|공과|"
            r"예체|예술|체육|의약|의학|의예|치의|한의|약학|수의|간호|"
            r"보건|의료|사범|교육|생활|대학|계열",
            prefix,
        ):
            phrases.append(prefix)
    return phrases


def scope_phrase_matches(department: str, track: str, phrase: str) -> bool:
    scope = compact(phrase)
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
    normalized = compact(value).replace("의약학", "")
    patterns = (
        ("치의", r"치의"), ("한의", r"한의"), ("수의", r"수의"),
        ("의학", r"(?<![한치수])의예|(?<![한치수])의학"),
        ("약학", r"약학"), ("간호", r"간호"), ("임상병리", r"임상병리"),
        ("물리치료", r"물리치료"), ("작업치료", r"작업치료"),
        ("치위생", r"치위생"), ("방사선", r"방사선"), ("응급구조", r"응급구조"),
    )
    return {name for name, pattern in patterns if re.search(pattern, normalized)}


def infer_nonratio(value: str, section_text: str, domain: str) -> str:
    token = clean(value)
    compact_value = compact(token)
    if re.search(r"상위|우수", token):
        percentages = re.findall(r"\d+(?:\.\d+)?\s*%", token)
        return f"상위 {' / '.join(percentages)}" if percentages else "상위 영역"
    if re.search(r"선택|택\s*\d|또는", token):
        percentages = re.findall(r"\d+(?:\.\d+)?\s*%", token)
        if percentages:
            return f"({' / '.join(percentages)})"
        numbers = re.findall(r"\d+(?:\.\d+)?", token)
        if numbers and re.search(r"반영비율|각\s*\d", token):
            return f"({format_percent(float(numbers[-1]))})"
        return "선택"
    if "가산" in token:
        return "가산점"
    if "감산" in token or "감점" in token:
        return "감점"
    if "환산" in token or "등급" in token:
        return "등급 환산" if domain == "english" else token
    if token in {"-", "—", "", "미반영", "반영안함"}:
        if domain == "english":
            if re.search(r"영어.{0,80}(?:가산점|가점)", section_text):
                return "가산점"
            if re.search(r"영어.{0,80}(?:감점|감산)", section_text):
                return "감점"
            if re.search(r"영어.{0,100}(?:등급별|환산점수)", section_text):
                return "등급 환산"
        return "—"
    if "%" in token:
        match = re.search(r"(\d+(?:\.\d+)?)\s*%", token)
        if match:
            percentage = format_percent(float(match.group(1)))
            if re.search(r"선택|택\s*1|또는", token) or token.strip().startswith("("):
                return f"({percentage})"
            return percentage
    trailing_number = re.search(r"(?:^|\s)(\d+(?:\.\d+)?)\s*$", token)
    if trailing_number and re.search(r"국어|수학|영어|탐구|사탐|과탐|직탐", token):
        return format_percent(float(trailing_number.group(1)))
    if compact_value in {"필수", "반영"}:
        return token
    required_number = re.search(r"(\d+(?:\.\d+)?)\s*(?:\([^)]*\))?", token)
    if required_number and "필수" in token:
        return format_percent(float(required_number.group(1)))
    return token or "—"


DOMAIN_NAMES = {
    "korean": "국어",
    "math": "수학",
    "english": "영어",
    "inquiry": "탐구",
}


def ranked_label(text: str) -> str | None:
    marker = re.search(r"상위|우수", text)
    if not marker:
        return None
    start = marker.start()
    prefix = text[max(0, marker.start() - 140) : marker.start()]
    rank_start = list(re.finditer(r"1\s*순위", prefix))
    if rank_start:
        start = max(0, marker.start() - 140) + rank_start[-1].start()
    tail = text[start : start + 260]
    tail = re.sub(r"(\d+(?:\.\d+)?\s*%)\s*\(\s*100\s*%\s*\)", r"\1", tail)
    tail = re.split(r"가산점|가점|감점|총점|합계", tail, maxsplit=1)[0]
    percentages: list[str] = []
    for value in re.findall(r"(\d+(?:\.\d+)?)\s*%", tail):
        label = format_percent(float(value))
        if label not in percentages:
            percentages.append(label)
    if len(percentages) > 1 and re.search(r"합계|총점|총\s*100", tail):
        percentages = [value for value in percentages if value != "100%"] or percentages
    if percentages:
        return f"({' / '.join(percentages[:4])})"
    count = re.search(r"상위\s*(\d+)\s*개", tail)
    return f"상위 {count.group(1)}개" if count else "상위 영역"


def apply_selection_semantics(target: str, labels: dict[str, str]) -> dict[str, str]:
    updated = dict(labels)
    ranked = ranked_label(target)
    if ranked:
        for domain, name in DOMAIN_NAMES.items():
            if name in target and (updated.get(domain) in {"", "—", "선택"} or "선택" in target):
                updated[domain] = ranked

    normalized_target = compact(target)
    selection_marker = re.search(r"(?:중)?(?:택1|1개(?:영역)?선택)", normalized_target)
    if selection_marker:
        selection_scope = normalized_target[max(0, selection_marker.start() - 90) : selection_marker.start()]
        selection_domains = [
            domain for domain, name in DOMAIN_NAMES.items() if compact(name) in selection_scope
        ]
        if len(selection_domains) >= 2:
            for domain in selection_domains:
                label = updated.get(domain, "")
                if re.fullmatch(r"\d+(?:\.\d+)?%", label):
                    updated[domain] = f"({label})"

    choose_match = re.search(r"(\d+)개선택", normalized_target)
    if choose_match and "필수" in normalized_target:
        required_segment = normalized_target[: normalized_target.find("필수")]
        required_domains = {
            domain for domain, name in DOMAIN_NAMES.items() if compact(name) in required_segment
        }
        choose_count = int(choose_match.group(1))
        active_count = len(required_domains) + choose_count
        if active_count:
            equal_points = [
                float(match.group(1))
                for label in updated.values()
                if (match := re.fullmatch(r"(\d+(?:\.\d+)?)%", label or ""))
            ]
            if equal_points and max(equal_points) == min(equal_points) and equal_points[0] >= 50:
                active_label = format_percent(100 / active_count)
                for domain, name in DOMAIN_NAMES.items():
                    if name not in target:
                        continue
                    updated[domain] = active_label if domain in required_domains else f"({active_label})"
    return updated


def normalize_domain_values(
    raw: dict[str, list[tuple[str, str]]], section_text: str
) -> dict[str, str]:
    # raw values are (cell text, domain-header text). 수학 선택과목 및 사탐/과탐
    # 열은 대체 관계지만 탐구 1·2과목은 동시에 합산하므로 헤더 의미를 구분한다.
    parsed: dict[str, list[tuple[float, str, bool]]] = {}
    domain_notes: dict[str, str] = {}
    selected_domains: set[str] = set()
    ranked_domains: dict[str, str] = {}
    for domain, values in raw.items():
        seen: set[tuple[str, str]] = set()
        for value, header in values:
            key = (compact(header) or domain, clean(value))
            if key in seen:
                continue
            seen.add(key)
            cleaned_value = clean(value)
            percent = re.search(r"(\d+(?:\.\d+)?)\s*%", cleaned_value)
            subject_count = re.fullmatch(r"\(?\s*(\d+(?:\.\d+)?)\s*\(?\s*(\d+)\s*과목\s*\)?\s*\)?", cleaned_value)
            annotated_value = re.fullmatch(
                r"\(?\s*(\d+(?:\.\d+)?)\s*\(?\s*(?:(최고점)\s*)?(?:(\d+)\s*과목(?:\s*(평균))?|([과사])|\*)\s*\)?\s*\)?",
                cleaned_value,
            )
            table_ratio = bool(re.search(r"반영비율|%", header))
            choice_value = re.fullmatch(
                r"(?:\(|<)?\s*(\d+(?:\.\d+)?)\s*(?:점)?\s*(?:\)|>)?\s*(?:\*|[①-⑳]|\(?\s*택\s*1\s*\)?)?",
                cleaned_value,
            )
            number = (
                float(percent.group(1))
                if percent
                else float(subject_count.group(1))
                if subject_count
                else float(annotated_value.group(1))
                if annotated_value
                else float(choice_value.group(1))
                if choice_value
                else numeric_value(value)
            )
            if number is not None:
                parsed.setdefault(domain, []).append(
                    (number, compact(header), percent is not None or subject_count is not None or annotated_value is not None or table_ratio)
                )
                if subject_count:
                    domain_notes[domain] = f"{subject_count.group(2)}과목"
                elif annotated_value:
                    if annotated_value.group(3):
                        prefix = "최고 " if annotated_value.group(2) else ""
                        suffix = " 평균" if annotated_value.group(4) else ""
                        domain_notes[domain] = f"{prefix}{annotated_value.group(3)}과목{suffix}"
                    elif annotated_value.group(5):
                        domain_notes[domain] = "과탐" if annotated_value.group(5) == "과" else "사탐"
                if ("선택" in cleaned_value and "필수" not in cleaned_value) or re.fullmatch(
                    r"<\s*\d+(?:\.\d+)?\s*>", cleaned_value
                ):
                    selected_domains.add(domain)
                if re.search(r"상위|우수", cleaned_value):
                    ranked = ranked_label(cleaned_value)
                    if ranked:
                        ranked_domains[domain] = ranked

    def aggregate(domain: str) -> tuple[float, bool] | None:
        entries = parsed.get(domain, [])
        if not entries:
            return None
        totals = [entry for entry in entries if re.search(r"(?:소계|합계|계)$", entry[1])]
        explicit_totals = [entry for entry in totals if entry[2]]
        if explicit_totals:
            return max(explicit_totals, key=lambda entry: entry[0])[0], True
        subjects = [entry for entry in entries if re.search(r"[12]과목", entry[1])]
        has_first_subject = any("1과목" in entry[1] for entry in subjects)
        has_second_subject = any("2과목" in entry[1] for entry in subjects)
        if domain == "inquiry" and has_first_subject and has_second_subject:
            by_header: dict[str, tuple[float, bool]] = {}
            for number, header, is_percent in subjects:
                by_header.setdefault(header, (number, is_percent))
            domain_notes[domain] = "2과목 합계"
            return sum(value[0] for value in by_header.values()), all(value[1] for value in by_header.values())
        if totals and all(not entry[2] for entry in entries):
            return max(totals, key=lambda entry: entry[0])[0], False
        distinct = {(number, is_percent) for number, _, is_percent in entries}
        if len(distinct) == 1:
            return next(iter(distinct))
        # 서로 다른 사탐/과탐 또는 수학 선택과목 배점은 한 값으로 단정하지 않는다.
        alternatives = any(re.search(r"사회|과학|직업|확률|미적|기하", header) for _, header, _ in entries)
        if alternatives:
            return None
        return max(entries, key=lambda entry: entry[0])[0], all(entry[2] for entry in entries)

    aggregates = {domain: aggregate(domain) for domain in ("korean", "math", "english", "inquiry")}
    point_values = [value for value in aggregates.values() if value is not None and not value[1]]
    explicit_percent_exists = any(value is not None and value[1] for value in aggregates.values())
    point_total = sum(value[0] for value in point_values)
    allowed_nonratio = re.compile(r"가산|가점|감점|환산|등급|미반영|반영안함")
    ambiguous_missing = any(
        aggregates[domain] is None
        and any(
            (label := infer_nonratio(value, section_text, domain)) not in {"", "—"}
            and not allowed_nonratio.search(label)
            for value, _ in raw.get(domain, [])
        )
        for domain in aggregates
    )
    normalize_points = not explicit_percent_exists and not ambiguous_missing and point_total > 0 and not math.isclose(point_total, 100, abs_tol=0.15)

    result: dict[str, str] = {}
    for domain in ("korean", "math", "english", "inquiry"):
        if domain in ranked_domains:
            result[domain] = ranked_domains[domain]
            continue
        aggregate_value = aggregates[domain]
        if aggregate_value is not None:
            number, is_percent = aggregate_value
            percentage = number if is_percent or not normalize_points else number / point_total * 100
            note = domain_notes.get(domain)
            label = f"{format_percent(percentage)} ({note})" if note else format_percent(percentage)
            result[domain] = f"({label})" if domain in selected_domains else label
            continue
        rendered: list[str] = []
        for value, _ in raw.get(domain, []):
            label = infer_nonratio(value, section_text, domain)
            if label not in rendered and label != "—":
                rendered.append(label)
        result[domain] = " / ".join(rendered) if rendered else infer_nonratio("", section_text, domain)
    return result


def target_text(values: list[str]) -> str:
    ignored = re.compile(
        r"^(구분|계열|모집단위|모집계열|반영영역|반영과목|반영비율|반영점수|점수|총점|"
        r"수능|수능성적활용지표|활용지표|비고|합계)$"
    )
    result: list[str] = []
    for value in values:
        value = clean(value)
        if not value or ignored.match(value) or value in result:
            continue
        result.append(value)
    return " ".join(result)


def parse_column_table(grid: list[list[str]], section_text: str) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    header_rows: list[tuple[int, dict[int, str]]] = []
    for index, row in enumerate(grid[:7]):
        domains = {column: domain for column, value in enumerate(row) if (domain := header_domain(value))}
        if len(set(domains.values())) >= 2:
            header_rows.append((index, domains))
            break
    if not header_rows:
        return rules
    header_end = header_rows[0][0]
    # Include inquiry subheaders (사회/과학/직업), but stop before the first
    # data row. Data notes often mention 수학 or 탐구 and must not become headers.
    for index in range(header_end + 1, min(len(grid), header_end + 3)):
        row = grid[index]
        domains = {column: domain for column, value in enumerate(row) if (domain := header_domain(value))}
        if domains and not any(is_value(value) for value in row):
            header_end = index
        else:
            break
    domain_columns: dict[int, str] = {}
    domain_headers: dict[int, str] = {}
    for column in range(len(grid[0])):
        parts: list[str] = []
        for row in grid[: header_end + 1]:
            value = clean(row[column])
            if value and value not in parts:
                parts.append(value)
        aggregate = " ".join(parts)
        if "반영과목수" in compact(aggregate):
            continue
        domain = header_domain(aggregate)
        if domain:
            domain_columns[column] = domain
            domain_headers[column] = aggregate
    if len(set(domain_columns.values())) < 2:
        return rules
    first_domain = min(domain_columns)
    for row in grid[header_end + 1 :]:
        raw: dict[str, list[tuple[str, str]]] = {}
        for column, domain in domain_columns.items():
            value = clean(row[column])
            if is_value(value) or value in {"-", "—", ""}:
                raw.setdefault(domain, []).append((value, domain_headers[column]))
        if len([domain for domain, values in raw.items() if any(is_value(value) for value, _ in values)]) < 2:
            continue
        target = target_text(row[:first_domain])
        if not target:
            target = "전 모집단위"
        labels = normalize_domain_values(raw, section_text)
        rules.append({"target": target, "labels": apply_selection_semantics(target, labels)})
    return rules


def parse_paired_rows(grid: list[list[str]], section_text: str) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    for index, row in enumerate(grid[:-1]):
        label_columns = [column for column, value in enumerate(row) if compact(value) in {"반영영역", "반영과목"}]
        if not label_columns:
            continue
        label_column = label_columns[0]
        domain_columns = {
            column: domain
            for column, value in enumerate(row[label_column + 1 :], label_column + 1)
            if (domain := header_domain(value))
        }
        if len(set(domain_columns.values())) < 2:
            continue
        value_row = grid[index + 1]
        if not any(compact(value) in {"반영점수", "반영비율", "배점"} for value in value_row[: label_column + 1]):
            continue
        raw: dict[str, list[tuple[str, str]]] = {}
        for column, domain in domain_columns.items():
            value = clean(value_row[column])
            raw.setdefault(domain, []).append((value, clean(row[column])))
        if len([domain for domain, values in raw.items() if any(is_value(value) for value, _ in values)]) < 2:
            continue
        target = target_text(row[:label_column]) or "전 모집단위"
        labels = normalize_domain_values(raw, section_text)
        rules.append({"target": target, "labels": apply_selection_semantics(target, labels)})
    return rules


def prose_labels(text: str, section_text: str) -> dict[str, str] | None:
    if re.search(r"최저학력|등급\s*합", text):
        return None
    mentioned = {domain for domain, name in DOMAIN_NAMES.items() if name in text}
    if len(mentioned) < 3:
        return None
    if not re.search(r"%|상위|우수|각\s*영역|각영역|반영비율|반영성적", text):
        return None
    labels = {domain: "—" for domain in DOMAIN_NAMES}
    patterns = {
        "korean": r"국어(?:\s*영역)?\s*[(:]?\s*(\d+(?:\.\d+)?)\s*%",
        "math": r"수학(?:\s*영역)?\s*[(:]?\s*(\d+(?:\.\d+)?)\s*%",
        "english": r"영어(?:\s*영역)?\s*[(:]?\s*(\d+(?:\.\d+)?)\s*%",
        "inquiry": r"(?:탐구|사탐|과탐)(?:\s*영역)?(?:\s*\([^)]{0,30}\))?\s*[(:]?\s*(\d+(?:\.\d+)?)\s*%",
    }
    for domain, pattern in patterns.items():
        match = re.search(pattern, text)
        if match:
            labels[domain] = format_percent(float(match.group(1)))

    equal = re.search(r"각\s*영역(?:별)?\s*(\d+(?:\.\d+)?)\s*%", text)
    if equal:
        value = format_percent(float(equal.group(1)))
        for domain in mentioned:
            labels[domain] = value

    ranked = ranked_label(text)
    if ranked:
        for domain in mentioned:
            if labels[domain] == "—":
                labels[domain] = ranked

    for first, second in (("korean", "inquiry"), ("math", "inquiry"), ("korean", "math")):
        first_name = DOMAIN_NAMES[first]
        second_name = DOMAIN_NAMES[second]
        shared = re.search(
            rf"{first_name}\s*또는.{{0,90}}{second_name}.{{0,35}}?(\d+(?:\.\d+)?)\s*%",
            text,
        )
        if shared:
            shared_label = f"({format_percent(float(shared.group(1)))})"
            labels[first] = shared_label
            labels[second] = shared_label

    if labels["english"] == "—" and "영어" in text:
        if re.search(r"영어.{0,80}(?:가산점|가점)", text):
            labels["english"] = "가산점"
        elif re.search(r"영어.{0,100}(?:등급|환산)", text):
            labels["english"] = "등급 환산"
    labels = apply_selection_semantics(text, labels)
    return labels if sum(value != "—" for value in labels.values()) >= 2 else None


def parse_prose_table(table, section_text: str) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    for tr in table.xpath(".//tr"):
        values = [visible_cell_text(cell) for cell in tr.xpath("./th|./td")]
        text = clean(" ".join(value for value in values if value))
        labels = prose_labels(text, section_text)
        if labels:
            rules.append({"target": text[:1200], "labels": labels, "origin": "prose"})
    return rules


def parse_rules(content: str, year: int, code: str) -> list[dict[str, Any]]:
    section = regular_section(content)
    if section is None:
        return []
    section_text = clean(section.text_content())
    rules: list[dict[str, Any]] = []
    for table in section.xpath(".//table[not(.//table)]"):
        text = clean(table.text_content())
        if not ("국어" in text and "수학" in text and ("탐구" in text or "사회" in text or "과학" in text)):
            continue
        grid = expanded_grid(table)
        if not grid:
            continue
        table_rules = [
            *parse_paired_rows(grid, section_text),
            *parse_column_table(grid, section_text),
            *parse_prose_table(table, section_text),
        ]
        previous = table.getprevious()
        table_scope = clean(previous.text_content()) if previous is not None else ""
        if len(table_scope) <= 120 and re.search(
            r"일반(?:학생|전형)?\s*[123ⅠⅡⅢ]?|수능우수|지역인재|실기전형|정시\s*[‘'\"]?[가나다]",
            table_scope,
        ):
            for rule in table_rules:
                rule["target"] = clean(f"{table_scope} {rule['target']}")
        rules.extend(table_rules)

    unique: dict[str, dict[str, Any]] = {}
    for rule in rules:
        labels = rule["labels"]
        if sum(label not in {"", "—"} for label in labels.values()) < 2:
            continue
        rule.update(
            {
                "year": year,
                "code": code,
                "source": DETAIL_URL.format(year=year, code=code),
            }
        )
        key = json.dumps([compact(rule["target"]), labels], ensure_ascii=False, sort_keys=True)
        unique.setdefault(key, rule)
    return list(unique.values())


def score_track(score: dict[str, Any]) -> str:
    declared = clean(score.get("t") or "")
    department = compact(score.get("d") or "")
    if HEALTH_NATURAL.search(department):
        return "자연"
    if CORE_MEDICAL.search(department):
        return "의약학"
    if ARTS.search(department):
        return "예체능"
    if declared in {"인문", "자연", "예체능", "의약학"}:
        return declared
    if NATURAL.search(department):
        return "자연"
    return "인문"


def explicit_keywords(value: str) -> list[str]:
    keys = [
        "의예", "의학", "치의예", "한의예", "약학", "수의", "간호", "임상병리", "치위생", "작업치료",
        "체육교육", "스포츠", "디자인", "미술", "음악", "자율전공", "경영", "경제", "사범", "교육",
        "인문대", "사회과학", "자연과학", "공과대", "공학", "예체능", "인문", "자연", "자유전공", "자율전공",
    ]
    normalized = compact(value)
    return [key for key in keys if compact(key) in normalized]


def general_variant(value: str, infer_first: bool = False) -> str | None:
    normalized = compact(
        (value or "").replace("Ⅰ", "1").replace("Ⅱ", "2").replace("Ⅲ", "3")
    )
    match = re.search(r"일반(?:학생|전형)?([123])", normalized)
    if match:
        return match.group(1)
    if infer_first and re.search(r"일반(?:학생|전형)", normalized):
        return "1"
    return None


def department_group_rank(department: str, target: str) -> int:
    mappings = [
        (r"인문대|인문계열", r"국어|문예|영어영문|철학|역사|어문|문화|언어|문학|종교"),
        (r"사회과학|사회계열", r"정치|행정|공공|문헌정보|미디어|언론|사회|심리|도시|부동산|아동|가족|복지|광고홍보"),
        (r"경영경제|경영대|상경", r"경영|경제|무역|회계|금융|통계|국제물류"),
        (r"사범|교육계열", r"교육과|유아교육|교육학"),
        (r"예체|예술|체육", ARTS.pattern),
        (r"의약학|의학|의예|치의|한의|약학|수의|간호|보건|의료", MEDICAL.pattern),
        (r"자연|공학|이공", NATURAL.pattern),
    ]
    return sum(34 for target_pattern, department_pattern in mappings if re.search(target_pattern, target) and re.search(department_pattern, department))


def specific_unit_matches(department: str, unit: str, target: str) -> bool:
    canonical_department = canonical_unit(department)
    canonical_specific = canonical_unit(unit)
    canonical_target = canonical_unit(target)
    if canonical_specific and (
        canonical_specific in canonical_department
        or canonical_department in canonical_specific
        or canonical_department in canonical_target
    ):
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
    target_medical_units = medical_unit_types(target)
    department_medical_units = medical_unit_types(department)
    return bool(target_medical_units.intersection(department_medical_units))


def department_variant_conflicts(department_value: str, target: str) -> bool:
    raw_department = clean(department_value)
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
    if distinctive and contexts:
        target_has_qualifier = any(re.search(r"자유전공|자율전공|글로벌|공공정책|과학기술|인문사회", context) for context in contexts)
        if target_has_qualifier and not any(any(value in context for value in distinctive) for context in contexts):
            return True
    return False


def rule_rank(score: dict[str, Any], rule: dict[str, Any]) -> int:
    target = compact(rule["target"])
    department = compact(score.get("d") or "")
    exam = compact(f"{score.get('exam') or ''} {score.get('a') or ''}")
    track = score_track(score)
    if not target:
        return 0
    canonical_department = canonical_unit(department)
    canonical_target = canonical_unit(target)
    named_scope = bool(canonical_department and canonical_department in canonical_target)
    medical_scope = bool(medical_unit_types(target).intersection(medical_unit_types(department)))
    scope_override = named_scope or medical_scope
    if not scope_override and track == "의약학" and re.search(r"인문|사회|경영|상경|어문|예체|예술|체육", target):
        return -100
    if not scope_override and track == "의약학" and re.search(r"자연|공학|이공|수리", target) and not medical_unit_types(target):
        return -100
    if not scope_override and track == "예체능" and re.search(r"인문|사회|경영|상경|어문|자연|공학|이공|수리|의예|치의|한의|약학|수의", target) and not ARTS.search(target):
        return -100
    if not scope_override and track == "인문" and re.search(r"자연|공학|이공|수리|의예|치의|한의|약학|수의|예체|예술|체육", target):
        return -100
    if not scope_override and track == "자연" and re.search(r"인문|사회|경영|상경|어문|예체|예술|체육", target) and not re.search(r"자연|공학|이공|수리", target):
        return -100
    target_groups = admission_groups(rule["target"])
    score_groups = admission_groups(f"{clean(score.get('g') or '')}군")
    if target_groups and score_groups and not target_groups.intersection(score_groups):
        return -100
    if SPECIAL_EXAM.search(rule["target"]) and not SPECIAL_EXAM.search(f"{score.get('exam') or ''} {score.get('a') or ''}"):
        return -100
    if re.search(r"특별전형|국방|군사", rule["target"]) and not re.search(r"특별|국방|군사", f"{score.get('exam') or ''} {score.get('a') or ''} {score.get('d') or ''}"):
        return -100
    if "실기" in target and "실기" not in exam and not named_scope:
        return -100
    if department_variant_conflicts(clean(score.get("d") or ""), clean(rule["target"])):
        return -100
    if "광역" in target and "광역" not in department and "전체" not in target and "전모집단위" not in target:
        return -100
    if "제외" in target:
        before_exclusion = target.rsplit("제외", 1)[0]
        if department and department in before_exclusion[-100:]:
            return -100
        excluded_medical = medical_unit_types(before_exclusion[-120:])
        if excluded_medical.intersection(medical_unit_types(department)):
            return -100
        for key in explicit_keywords(department):
            if compact(key) in before_exclusion[-40:]:
                return -100

    generic_scope = is_generic_scope(rule["target"])
    scope_text = clean(rule["target"]).split("제외", 1)[0]
    specific_units = [compact(value) for value in re.findall(r"(?:^|[\s,/(])([^,;/()]{1,40}?(?:학과|학부|전공|예과|교육과))(?=$|[\s,/)])", scope_text)]
    matched_specific_unit = any(specific_unit_matches(department, unit, target) for unit in specific_units)
    scoped_phrases = scoped_scope_phrases(scope_text)
    matched_scoped_phrase = any(scope_phrase_matches(department, track, phrase) for phrase in scoped_phrases)
    if (specific_units or scoped_phrases) and not generic_scope and not (matched_specific_unit or matched_scoped_phrase):
        return -100

    target_medical_units = medical_unit_types(target)
    department_medical_units = medical_unit_types(department)
    if target_medical_units and not generic_scope and not matched_specific_unit and not target_medical_units.intersection(department_medical_units):
        return -100

    rank = 0
    if named_scope:
        rank += 120
    else:
        department_keys = [key for key in explicit_keywords(department) if len(compact(key)) >= 2]
        target_keys = explicit_keywords(target)
        overlap = set(department_keys) & set(target_keys)
        rank += min(80, len(overlap) * 24)
    group_rank = department_group_rank(department, target)
    rank += group_rank
    if re.search(r"대학|칼리지", target) and not generic_scope and department not in target and group_rank == 0:
        return -100

    variant = general_variant(exam, infer_first=True)
    target_variant = general_variant(target)
    if variant and target_variant:
        if variant != target_variant:
            return -100
        rank += 30
    elif "일반" in target and "일반" in exam:
        rank += 8

    if track == "의약학" and MEDICAL.search(target):
        rank += 28
    elif track == "예체능" and ARTS.search(target):
        rank += 24
    elif track == "자연" and re.search(r"자연|공학|이공|수리", target):
        rank += 22
    elif track == "인문" and re.search(r"인문|사회|경영|상경|어문", target):
        rank += 22
    if generic_scope:
        rank += 20

    specific = explicit_keywords(target)
    if specific and rank < 20 and not generic_scope:
        return 0
    return rank


def rule_is_valid(rule: dict[str, Any]) -> bool:
    labels = rule.get("labels") or {}
    percentages: list[float] = []
    fixed: list[float] = []
    has_selection = bool(re.search(r"상위|우수|선택|택\s*\d|또는", rule.get("target") or "")) or any(
        re.search(r"상위|우수|선택|\(", clean(label)) for label in labels.values()
    )
    if rule.get("origin") == "prose":
        target_value = rule.get("target") or ""
        repeated_domains = sum(len(re.findall(name, target_value)) > 1 for name in DOMAIN_NAMES.values())
        if repeated_domains >= 2 and len(re.findall(r"\d+(?:\.\d+)?\s*%", target_value)) > 4:
            return False
    for label in labels.values():
        text = clean(label)
        matches = list(re.finditer(r"(\d+(?:\.\d+)?)\s*%", text))
        for match in matches:
            value = float(match.group(1))
            decimals = (match.group(1).split(".", 1)[1] if "." in match.group(1) else "")
            if value > 100 or len(decimals) > 2:
                return False
            percentages.append(value)
        if len(matches) > 1 and any(float(match.group(1)) <= 5 for match in matches[1:]):
            return False
        if len(matches) == 1 and not re.search(r"상위|우수|선택|\(|/", text):
            fixed.append(float(matches[0].group(1)))
    if not percentages:
        return False
    if any(len(re.findall(r"\d+(?:\.\d+)?\s*%", clean(label))) > 1 and "100%" in clean(label) for label in labels.values()):
        return False
    if re.search(r"가산점|가점", rule.get("target") or "") and max(percentages) <= 20 and len(set(percentages)) == 1:
        return False
    if not has_selection and len(fixed) >= 2 and sum(fixed) > 101:
        return False
    return True


def choose_rule(score: dict[str, Any], rules: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, bool]:
    ranked = [(rule_rank(score, rule), rule) for rule in rules if rule_is_valid(rule)]
    ranked = [(rank, rule) for rank, rule in ranked if rank > 0]
    if not ranked:
        return None, False
    best_rank = max(rank for rank, _ in ranked)
    best = [rule for rank, rule in ranked if rank == best_rank]
    signatures = {json.dumps(rule["labels"], ensure_ascii=False, sort_keys=True) for rule in best}
    if len(signatures) > 1:
        variant_rules: list[tuple[str, str, dict[str, Any]]] = []
        for rule in best:
            target = clean(rule["target"])
            marker = re.search(r"\b([A-D])\s*(?:유형|형)\b", target, re.I)
            if not marker:
                variant_rules = []
                break
            base = compact(target[: marker.start()] + target[marker.end() :])
            variant_rules.append((marker.group(1).upper(), base, rule))
        if variant_rules and len({base for _, base, _ in variant_rules}) == 1:
            ordered = sorted(variant_rules, key=lambda item: item[0])
            labels: dict[str, str] = {}
            for domain in DOMAIN_NAMES:
                values = [(variant, clean(rule["labels"].get(domain) or "—")) for variant, _, rule in ordered]
                distinct = {value for _, value in values}
                labels[domain] = next(iter(distinct)) if len(distinct) == 1 else " / ".join(f"{variant}형 {value}" for variant, value in values)
            first = ordered[0][2]
            base_target = re.sub(r"\s*\b[A-D]\s*(?:유형|형)\b.*$", "", clean(first["target"]), flags=re.I).strip()
            merged = dict(first)
            merged["target"] = f"{base_target} {'/'.join(f'{variant}형' for variant, _, _ in ordered)}"
            merged["labels"] = labels
            return merged, False
        return None, True
    return best[0], False


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    scores = data["scores"]
    university_codes: dict[str, set[str]] = {}
    for score in scores:
        direct_code = source_code(score.get("source"))
        if direct_code:
            university_codes.setdefault(score["u"], set()).add(direct_code)

    def resolved_code(score: dict[str, Any]) -> str | None:
        direct_code = source_code(score.get("source"))
        if direct_code:
            return direct_code
        candidates = university_codes.get(score["u"], set())
        return next(iter(candidates)) if len(candidates) == 1 else None

    pair_names: dict[tuple[int, str], set[str]] = {}
    unresolved_code_rows = 0
    for score in scores:
        year = int(score["y"])
        code = resolved_code(score)
        if not code:
            unresolved_code_rows += 1
            continue
        pair_names.setdefault((year, code), set()).add(score["u"])

    pairs = sorted(pair_names)
    expected_cache_names = {f"{year}-{code}.html" for year, code in pairs}
    if CACHE_DIR.exists():
        for cache_file in CACHE_DIR.glob("*.html"):
            if cache_file.name not in expected_cache_names:
                cache_file.unlink()
    downloaded: dict[tuple[int, str], tuple[str, str | None]] = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch, pair): pair for pair in pairs}
        for index, future in enumerate(as_completed(futures), 1):
            year, code, content, error = future.result()
            downloaded[(year, code)] = (content, error)
            if index % 25 == 0 or index == len(pairs):
                print(f"대학어디가 {year} 전형기준 {index}/{len(pairs)} 확인")

    rules_by_pair: dict[tuple[int, str], list[dict[str, Any]]] = {}
    parse_failures: list[dict[str, Any]] = []
    for pair in pairs:
        content, error = downloaded.get(pair, ("", "수집 결과 없음"))
        if error:
            parse_failures.append({"year": pair[0], "code": pair[1], "error": error})
            continue
        rules = parse_rules(content, pair[0], pair[1])
        rules_by_pair[pair] = rules

    matched = 0
    ambiguous = 0
    unmatched = 0
    for score in scores:
        code = resolved_code(score)
        if not code:
            score.pop("yearMethod", None)
            unmatched += 1
            continue
        rule, is_ambiguous = choose_rule(score, rules_by_pair.get((int(score["y"]), code), []))
        if rule:
            score["yearMethod"] = {
                "year": rule["year"],
                "target": rule["target"],
                "labels": rule["labels"],
                "source": rule["source"],
            }
            matched += 1
        else:
            score.pop("yearMethod", None)
            unmatched += 1
            if is_ambiguous:
                ambiguous += 1

    quarantined = 0
    for score in scores:
        if score.get("id") in KNOWN_UNSAFE_IDS and score.pop("yearMethod", None) is not None:
            matched -= 1
            unmatched += 1
            quarantined += 1

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    summary = {
        "pairs": len(pairs),
        "pages_failed": len(parse_failures),
        "pairs_with_rules": sum(bool(rules) for rules in rules_by_pair.values()),
        "parsed_rules": sum(len(rules) for rules in rules_by_pair.values()),
        "valid_rules": sum(sum(rule_is_valid(rule) for rule in rules) for rules in rules_by_pair.values()),
        "score_rows": len(scores),
        "matched_rows": matched,
        "unmatched_rows": unmatched,
        "ambiguous_rows": ambiguous,
        "quarantined_rows": quarantined,
        "rows_without_adiga_code": unresolved_code_rows,
        "failures": parse_failures,
    }
    SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
