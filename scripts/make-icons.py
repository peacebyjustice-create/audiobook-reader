"""앱 아이콘 생성(외부 의존성 없음): 파란 바탕에 펼친 책, 한 줄이 노랗게 강조됨.
사용: python3 scripts/make-icons.py  → public/icon-192.png, icon-512.png, icon-maskable-512.png, favicon.svg
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public"
BG = (0x3A, 0x6E, 0xA5)
PAGE = (0xFD, 0xFC, 0xF8)
LINE = (0xB8, 0xC9, 0xDD)
HIGHLIGHT = (0xFF, 0xD7, 0x5E)

# 512 기준 도형: (x0, y0, x1, y1, 색)
SHAPES = [
    (104, 140, 250, 372, PAGE),
    (262, 140, 408, 372, PAGE),
]
for i, y in enumerate(range(178, 340, 34)):
    SHAPES.append((126, y, 228, y + 12, LINE))
    SHAPES.append((284, y, 386, y + 12, HIGHLIGHT if i == 2 else LINE))
SHAPES.append((278, 242, 392, 278, HIGHLIGHT))  # 강조 줄 배경


def render(size: int, maskable: bool) -> bytes:
    scale = size / 512
    # 마스커블 아이콘은 안전 영역(가운데 80%) 안에 그림
    shrink = 0.8 if maskable else 1.0
    radius = 0 if maskable else 96 * scale
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            # 둥근 모서리 바깥은 투명
            cx = min(px + 0.5, size - px - 0.5)
            cy = min(py + 0.5, size - py - 0.5)
            if radius and cx < radius and cy < radius and (radius - cx) ** 2 + (radius - cy) ** 2 > radius**2:
                row += bytes((0, 0, 0, 0))
                continue
            x = ((px + 0.5) / scale - 256) / shrink + 256
            y = ((py + 0.5) / scale - 256) / shrink + 256
            color = BG
            for x0, y0, x1, y1, c in SHAPES:
                if x0 <= x < x1 and y0 <= y < y1:
                    color = c
            row += bytes((*color, 255))
        rows.append(b"\x00" + bytes(row))
    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def svg() -> str:
    hexc = lambda c: "#%02x%02x%02x" % c
    rects = "".join(
        f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" fill="{hexc(c)}"/>' for x0, y0, x1, y1, c in SHAPES
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="{hexc(BG)}"/>{rects}</svg>\n'


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    (OUT / "icon-192.png").write_bytes(render(192, False))
    (OUT / "icon-512.png").write_bytes(render(512, False))
    (OUT / "icon-maskable-512.png").write_bytes(render(512, True))
    (OUT / "favicon.svg").write_text(svg())
    print("ok")
