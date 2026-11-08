"""Draw the app icons into docs/: a white open book on blue.

Run by hand when the mark changes (needs Pillow), then bump CACHE in docs/sw.js.
  icon-192.png, icon-512.png  full-bleed, purpose "any maskable": the mark stays
                              inside the 0.4-radius safe circle
  icon-180.png                iPhone home screen; iOS only rounds the corners,
                              so the mark is drawn 25% larger
  icon-mono-512.png           white on transparent, Android themed icons
"""
from pathlib import Path
from PIL import Image, ImageDraw

DOCS = Path(__file__).resolve().parent.parent / "docs"
BLUE, WHITE = (35, 80, 196, 255), (255, 255, 255, 255)


def book(draw, size, scale, fg, bg):
    c, u = size / 2, size * 0.034 * scale            # u = one unit of the mark
    P = lambda x, y: (c + x * u, c + y * u)
    for s in (-1, 1):                                # left page, right page
        draw.polygon([P(s * 0.6, -4.2), P(s * 8.2, -5.4), P(s * 8.2, 4.6), P(s * 0.6, 5.6)], fill=fg)
    for i, y in enumerate((-2.4, -0.6, 1.2)):        # text lines cut into each page
        for s in (-1, 1):
            draw.line([P(s * 2.2, y - 0.10 * (i + 1)), P(s * 6.6, y - 0.55 - 0.10 * (i + 1))], fill=bg, width=max(1, round(0.55 * u)))


def icon(size, scale, bg, fg, name):
    big = size * 4                                   # 4x supersampling for smooth edges
    img = Image.new("RGBA", (big, big), bg)
    line_bg = bg if bg[3] else (0, 0, 0, 0)
    book(ImageDraw.Draw(img), big, scale, fg, line_bg)
    img.resize((size, size), Image.LANCZOS).save(DOCS / name)


icon(192, 1.0, BLUE, WHITE, "icon-192.png")
icon(512, 1.0, BLUE, WHITE, "icon-512.png")
icon(180, 1.25, BLUE, WHITE, "icon-180.png")
icon(512, 1.0, (0, 0, 0, 0), WHITE, "icon-mono-512.png")
