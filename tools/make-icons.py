#!/usr/bin/env python3
"""Regenerate the placeholder icon set in src/images.

Placeholders only: an indigo disc with three dots, standing for the masked
characters. Deliberately carries no bank's branding. Replace with real artwork
before shipping, then delete this script -- it would overwrite it.

Usage: python3 tools/make-icons.py
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src" / "images"
ICON_SIZES = [48, 96, 128, 256, 512]
TOOLBAR_SIZES = [16, 32]

INDIGO = (88, 86, 214)
WHITE = (255, 255, 255)


def coverage(px, py, cx, cy, r):
    """Approximate anti-aliased coverage of a disc over one pixel (4x4 samples)."""
    hits = 0
    for sy in range(4):
        for sx in range(4):
            dx = px + (sx + 0.5) / 4 - cx
            dy = py + (sy + 0.5) / 4 - cy
            if dx * dx + dy * dy <= r * r:
                hits += 1
    return hits / 16


def blend(bottom, top, alpha):
    return tuple(round(b + (t - b) * alpha) for b, t in zip(bottom, top))


def render(size):
    c = size / 2
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            disc = coverage(x, y, c, c, size * 0.48)
            if disc == 0:
                row += bytes((0, 0, 0, 0))
                continue

            rgb = INDIGO
            # Three dots, like the characters a masked password shows.
            mark = max(
                coverage(x, y, c + offset * size * 0.21, c, size * 0.082)
                for offset in (-1, 0, 1)
            )
            if mark:
                rgb = blend(rgb, WHITE, mark)

            row += bytes((*rgb, round(255 * disc)))
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    raw = b"".join(b"\x00" + row for row in render(size))

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for size in ICON_SIZES:
        write_png(OUT / f"icon-{size}.png", size)
    for size in TOOLBAR_SIZES:
        write_png(OUT / f"toolbar-{size}.png", size)
    print(f"wrote {len(ICON_SIZES) + len(TOOLBAR_SIZES)} icons to {OUT}")


if __name__ == "__main__":
    main()
