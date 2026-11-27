"""Assemble source-verified changes into a separate PC/mobile review input."""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import unicodedata
from pathlib import Path


def load(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def normalized(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value)).translate(
        str.maketrans({"ㆍ": "·", "・": "·", "•": "·", "․": "·", "∙": "·"})
    )


def identity(row: dict) -> tuple[str, ...]:
    section = row["section"]
    exam = re.sub(r"^수능위주(?:전형)?(?=\()", "수능", normalized(row["exam"]))
    exam = re.sub(r"([가나다])군(?=일반)", "", exam)
    exam = re.sub(r"(일반(?:학생)?)전형(?=[\d)]|$)", r"\1", exam)
    category = normalized(row["category"]) if section == "other" else ""
    return (normalized(row["u"]), exam, normalized(row["department"]), section, category)


def core_values(row: dict) -> tuple:
    section = row["section"]
    if section == "quota":
        return tuple(
            tuple(int(value.replace(",", "")) for value in re.findall(r"(\d[\d,]*)\s*명", row[side]))
            for side in ("previous", "current")
        )
    if section == "timing":
        return tuple(
            tuple(sorted(set(re.findall(r"[가나다]군|수시", row[side]))))
            for side in ("previous", "current")
        )
    return tuple(normalized(row[side]) for side in ("previous", "current"))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("comparison", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--reviewed", type=Path, action="append", default=[])
    parser.add_argument("--guide-audit", type=Path)
    args = parser.parse_args()

    baseline = load(args.baseline)
    comparison = load(args.comparison)
    unique_rows = {}
    manual = [row for path in args.reviewed for row in load(path)]
    for row in [*manual, *comparison["reviewed"]]:
        key = identity(row)
        existing = unique_rows.get(key)
        if existing and core_values(existing) != core_values(row):
            raise ValueError(f"Conflicting reviewed changes: {key}")
        unique_rows.setdefault(key, row)
    rows = []
    for entry_id, key in enumerate(sorted(unique_rows), 1):
        row = unique_rows[key]
        if row["previous"] == row["current"]:
            raise ValueError(f"Unchanged reviewed row: {key}")
        rows.append({**row, "id": entry_id})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {**baseline, "nationalChanges": rows, "nationalChangesReview": True},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    categories = dict(collections.Counter(row["section"] for row in rows))
    if args.guide_audit:
        guide_audit = load(args.guide_audit)
        comparison_counts = {
            key: value for key, value in comparison["audit"].items() if key != "undetermined"
        }
        summary = {
            "status": "REVIEW",
            "categories": categories,
            "campusesRepresentedByDisplayName": len({row["u"] for row in rows}),
            "comparison": comparison_counts,
            "guideEvidence": {
                "counts": guide_audit["counts"],
                "unresolvedReasons": dict(
                    collections.Counter(row.get("reason") or "unspecified" for row in guide_audit["unresolved"])
                ),
                "sha256": hashlib.sha256(args.guide_audit.read_bytes()).hexdigest(),
            },
        }
        report_directory = args.output.parent.parent / "audit"
        report_directory.mkdir(parents=True, exist_ok=True)
        (report_directory / "recruitment-comparison-summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(json.dumps(categories, ensure_ascii=False))


if __name__ == "__main__":
    main()
