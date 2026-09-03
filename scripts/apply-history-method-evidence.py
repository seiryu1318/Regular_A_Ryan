from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "admissions-data.json"
EVIDENCE_PATH = ROOT / "audit" / "history-method-evidence.csv"
TARGET_METHODS = {"가점", "감점", "등급 환산", "미반영"}
MANUAL_OFFICIAL_CHECKS = {
    "경상국립대": "미반영",
    "전남대": "가점",
    "전주교대": "미반영",
    "한국교원대": "미반영",
    "GIST": "가점",
}


def main() -> None:
    payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    with EVIDENCE_PATH.open(encoding="utf-8-sig", newline="") as handle:
        evidence = {row["university"]: row["method"] for row in csv.DictReader(handle)}

    changed = 0
    unresolved = []
    for profile in payload["profiles"]:
        method = MANUAL_OFFICIAL_CHECKS.get(profile["u"], evidence.get(profile["u"], ""))
        if method in TARGET_METHODS:
            profile["historyMethod"] = method
            changed += 1
        else:
            profile.pop("historyMethod", None)
            unresolved.append(profile["u"])

    payload.setdefault("summary", {})["profiles"] = len(payload["profiles"])

    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"profiles_tagged": changed, "unresolved": unresolved}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
