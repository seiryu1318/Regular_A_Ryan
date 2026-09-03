from __future__ import annotations

import sys
from pathlib import Path

import pymupdf


def main() -> None:
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    pages = [int(value) for value in sys.argv[3].split(",")]
    output.mkdir(parents=True, exist_ok=True)
    document = pymupdf.open(source)
    for page_number in pages:
        page = document[page_number - 1]
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2.2, 2.2), alpha=False)
        target = output / f"page-{page_number:03}.png"
        pixmap.save(target)
        print(target)


if __name__ == "__main__":
    main()
