"""Compare published regular recruitment rows and retain unmatched audit candidates."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import unicodedata
from pathlib import Path


GROUP_ORDER = {"가": 0, "나": 1, "다": 2}
YEARS = (2026, 2027)
SPECIAL_EXAM = re.compile(
    r"특성화|농어촌|지역(?:인재|균형|기회|메디|전형|의사)|강원인재|기회균형|"
    r"기회균등|저소득|차상위|수급|사회(?:적)?배려|특수교육|장애인|성인학습|"
    r"재직자|군위탁|정원\s*외|서해5도|고른기회|계약학과|기독교전형|"
    r"사이버국방|국방.*전형|항공시스템공학.*특별|자율전공\s*특별|"
    r"특별전형|재외국민|북한이탈|외국인전형|장기복무|서해오도|이웃사랑|"
    r"선취업후진학|라이프융합|새터민|탈북|전\s*교육\s*과정|12년\s*과정"
)
AGGREGATES = {"계", "소계", "합계", "총계", "전체", "모집단위"}


def clean(value: object) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).split())


def compact(value: object) -> str:
    punctuation = str.maketrans({"ㆍ": "·", "・": "·", "•": "·", "․": "·", "∙": "·"})
    return re.sub(r"\s+", "", clean(value)).translate(punctuation).casefold()


def exam_key(value: str, group: str) -> str:
    # The group prefix is a display label, as in 수능(가군 일반).
    return compact(re.sub(rf"(?<=[(\[])\s*{group}\s*군\s+", "", clean(value)))


def row_key(row: dict) -> tuple[str, str, str, str]:
    return (
        str(row["code"]),
        compact(row["examKind"]),
        exam_key(row["exam"], row["group"]),
        compact(row["department"]),
    )


def complete_pairs(payload: dict) -> set[tuple[int, str]]:
    return {
        (source["year"], source["code"])
        for source in payload["coverage"]
        if not source["problems"] and source["completedPopups"] == source["popupRows"]
    }


def read_rows(payload: dict, complete_sources: set[tuple[int, str]]) -> tuple[dict, collections.Counter]:
    rows: dict[tuple, dict[int, dict[str, list[dict]]]] = collections.defaultdict(
        lambda: {year: collections.defaultdict(list) for year in YEARS}
    )
    omitted: collections.Counter = collections.Counter()
    for row in payload["rows"]:
        year = row["year"]
        group = row["group"]
        exam = clean(row["exam"])
        kind = clean(row.get("examKind"))
        unit = clean(row["department"])
        if not all((reference_year, row["code"]) in complete_sources for reference_year in YEARS):
            omitted["incompleteSourcePair"] += 1
        elif year not in YEARS or group not in GROUP_ORDER:
            omitted["outsideRegularGroups"] += 1
        elif not exam or not kind or not unit or unit in AGGREGATES:
            omitted["missingIdentity"] += 1
        elif SPECIAL_EXAM.search(exam) or SPECIAL_EXAM.search(kind):
            omitted["specialAdmission"] += 1
        else:
            rows[row_key(row)][year][group].append(row)
    return rows, omitted


def seat_count(row: dict) -> int | None:
    count = row.get("quota")
    return count if type(count) is int and count >= 0 else None


def candidate(group_rows: dict, key: tuple, section: str) -> dict:
    previous, current = (
        [group_rows[year][group][0] for group in sorted(group_rows[year], key=GROUP_ORDER.get)]
        for year in YEARS
    )
    return {
        "key": [*key, section],
        "section": section,
        "u": current[0].get("universityLabel") or current[0]["university"],
        "exam": clean(current[0]["exam"]),
        "department": clean(current[0]["department"]),
        "previousRows": previous,
        "currentRows": current,
    }


def compare(payload: dict) -> tuple[list[dict], dict]:
    complete_sources = complete_pairs(payload)
    rows, omitted = read_rows(payload, complete_sources)
    categories: collections.Counter = collections.Counter()
    records = []
    undetermined = []
    for key, sides in sorted(rows.items()):
        old, new = (sides[year] for year in YEARS)
        if not old or not new:
            categories["oneYearOnly"] += 1
            undetermined.append({"key": key, "reason": "oneYearOnly"})
            continue
        if any(len(group) != 1 for groups in sides.values() for group in groups.values()):
            categories["ambiguousIdentity"] += 1
            undetermined.append({"key": key, "reason": "ambiguousIdentity"})
            continue
        seats = [
            {group: seat_count(group_rows[0]) for group, group_rows in side.items()}
            for side in (old, new)
        ]
        if any(count is None or count == 0 for counts in seats for count in counts.values()):
            categories["conditionalOrUnknownQuota"] += 1
            undetermined.append({"key": key, "reason": "conditionalOrUnknownQuota"})
            continue
        categories["comparable"] += 1
        if old.keys() != new.keys():
            records.append(candidate(sides, key, "timing"))
        if sum(seats[0].values()) != sum(seats[1].values()) or (
            old.keys() == new.keys() and seats[0] != seats[1]
        ):
            records.append(candidate(sides, key, "quota"))
        method_sets = [
            {compact(group_rows[0]["method"]) for group_rows in side.values()}
            for side in (old, new)
        ]
        if all(len(methods) == 1 and "" not in methods for methods in method_sets) and (
            method_sets[0] != method_sets[1]
        ):
            records.append(candidate(sides, key, "other"))
    codes = {source["code"] for source in payload["coverage"]}
    present = {year: {row["code"] for row in payload["rows"] if row["year"] == year} for year in YEARS}
    return records, {
        "sourceComplete": payload.get("complete", False),
        "expectedYearCampusPairs": payload.get("expectedPairs"),
        "completeYearCampusPairs": len(complete_sources),
        "completePairedCampuses": sum(
            all((year, code) in complete_sources for year in YEARS) for code in codes
        ),
        "campusesWithRowsInBothYears": len(present[2026] & present[2027]),
        "inputRows": len(payload["rows"]),
        "universitiesWithRows": len({row["code"] for row in payload["rows"]}),
        "matching": dict(categories),
        "omittedRows": dict(omitted),
        "candidateCounts": dict(collections.Counter(row["section"] for row in records)),
        "undetermined": undetermined,
        "sourceErrors": payload.get("errors", []),
    }


def evidence_key(row: dict) -> tuple:
    return (
        row["year"],
        row["code"],
        row["group"],
        exam_key(row["exam"], row["group"]),
        compact(row["department"]),
        row["quota"],
    )


def change_description(rows: list[dict], section: str) -> str:
    if section == "timing":
        return ", ".join(f"{row['group']}군" for row in rows)
    if section == "quota":
        return " · ".join(f"{row['group']}군 {row['quota']:,}명" for row in rows)
    return re.sub(r":\s*(\d+(?:\.\d+)?)(?![\d.])", r" \1%", clean(rows[0]["method"]))


def verified_source_link(row: dict) -> str:
    source = row["sourceUrl"].split("#", 1)[0]
    return source + f"#page={row['page']}" if row.get("page") else source


def reviewed_seat_values(path: Path) -> list[dict]:
    guide = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for department, (prior, current, page) in guide["seats"].items():
        for side, year, count in (("previous", 2026, prior), ("current", 2027, current)):
            rows.append(
                {
                    "year": year,
                    "code": guide["code"],
                    "group": guide["group"],
                    "exam": guide["exam"],
                    "department": department,
                    "quota": count,
                    "page": page if side == "current" else None,
                    "sourceUrl": guide["sources"][side],
                    "manual": True,
                }
            )
    return rows


def collect_reviewed(candidates: list[dict], confirmed: list[dict]) -> tuple[list[dict], dict]:
    """Require each annual 모집요강 value to match the Adiga row before surfacing a change."""
    by_value: dict[tuple, list[dict]] = collections.defaultdict(list)
    for proof in confirmed:
        by_value[evidence_key(proof)].append(proof)
    by_value = {
        key: [proof for proof in proofs if proof.get("manual")] or proofs
        for key, proofs in by_value.items()
    }
    rows = []
    verification: collections.Counter = collections.Counter()
    for candidate_row in candidates:
        section = candidate_row["section"]
        proofs: dict[str, list[dict]] = {}
        for side in ("previous", "current"):
            matched = [by_value.get(evidence_key(row), []) for row in candidate_row[f"{side}Rows"]]
            if not all(len(matches) == 1 for matches in matched):
                break
            proofs[side] = [matches[0] for matches in matched]
        if len(proofs) != 2:
            verification[f"awaitingGuide:{section}"] += 1
            continue
        if section == "other":
            same_method = all(
                compact(guide.get("method")) == compact(adiga["method"])
                for side, guide_rows in proofs.items()
                for guide, adiga in zip(guide_rows, candidate_row[f"{side}Rows"], strict=True)
            )
            if not same_method:
                verification["awaitingMethod:other"] += 1
                continue
        sources = {
            side: verified_source_link(guide_rows[0])
            for side, guide_rows in proofs.items()
        }
        method_label = "전형방법" if section == "other" else ("모집인원" if section == "quota" else "모집군")
        rows.append(
            {
                "u": candidate_row["u"],
                "exam": candidate_row["exam"],
                "department": candidate_row["department"],
                "section": section,
                "category": method_label,
                "previous": change_description(candidate_row["previousRows"], section),
                "current": change_description(candidate_row["currentRows"], section),
                "sources": sources,
                "evidence": {
                    side: [
                        {
                            "guide": guide["sourceUrl"],
                            "page": guide["page"],
                            "guideSha256": guide.get("guideSha256"),
                            "adiga": adiga["sourceUrl"],
                            "adigaSha256": adiga.get("sourceSha256"),
                        }
                        for guide, adiga in zip(guide_rows, candidate_row[f"{side}Rows"], strict=True)
                    ]
                    for side, guide_rows in proofs.items()
                },
            }
        )
        verification[f"verified:{section}"] += 1
    return rows, dict(verification)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--confirmed", type=Path)
    parser.add_argument("--seat-guide", type=Path, action="append", default=[])
    parser.add_argument("--additional-adiga", type=Path, action="append", default=[])
    args = parser.parse_args()
    content = args.input.read_bytes()
    data = json.loads(content)
    additional_digests = []
    for source in args.additional_adiga:
        additional_content = source.read_bytes()
        additional = json.loads(additional_content)
        roster = {item["code"] for item in data["coverage"]}
        new_coverage = [
            item for item in additional["coverage"]
            if item["code"] not in roster and item["directoryRows"] > 0
        ]
        new_codes = {item["code"] for item in new_coverage}
        data["coverage"].extend(new_coverage)
        data["rows"].extend(row for row in additional["rows"] if row["code"] in new_codes)
        data["errors"].extend(row for row in additional["errors"] if row["code"] in new_codes)
        data["expectedPairs"] += len(new_codes) * len(YEARS)
        data["complete"] = data["complete"] and len(complete_pairs(data)) == data["expectedPairs"]
        additional_digests.append(hashlib.sha256(additional_content).hexdigest())
    records, audit = compare(data)
    audit["inputSha256"] = hashlib.sha256(content).hexdigest()
    if additional_digests:
        audit["additionalInputSha256"] = additional_digests
    reviewed = []
    if args.confirmed or args.seat_guide:
        confirmed = json.loads(args.confirmed.read_text(encoding="utf-8"))["rows"] if args.confirmed else []
        confirmed.extend(row for path in args.seat_guide for row in reviewed_seat_values(path))
        reviewed, audit["guideVerification"] = collect_reviewed(records, confirmed)
    args.output.write_text(
        json.dumps({"audit": audit, "candidates": records, "reviewed": reviewed}, ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({key: value for key, value in audit.items() if key != "undetermined"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
