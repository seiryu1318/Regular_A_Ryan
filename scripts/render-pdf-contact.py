from __future__ import annotations

import sys
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw


def main() -> None:
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    document = pymupdf.open(source)
    thumbnails = []
    for index, page in enumerate(document):
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(0.42, 0.42), alpha=False)
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        canvas = Image.new("RGB", (image.width, image.height + 30), "white")
        canvas.paste(image, (0, 30))
        ImageDraw.Draw(canvas).text((8, 7), f"page {index + 1}", fill="black")
        thumbnails.append(canvas)
    columns = 4
    width = max(image.width for image in thumbnails)
    height = max(image.height for image in thumbnails)
    rows = (len(thumbnails) + columns - 1) // columns
    contact = Image.new("RGB", (columns * width, rows * height), "#dddddd")
    for index, image in enumerate(thumbnails):
        contact.paste(image, ((index % columns) * width, (index // columns) * height))
    output.parent.mkdir(parents=True, exist_ok=True)
    contact.save(output, quality=90)
    print(f"{len(thumbnails)} pages -> {output}")


if __name__ == "__main__":
    main()
