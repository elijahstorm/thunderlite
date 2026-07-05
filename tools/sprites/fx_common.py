"""Shared helpers for the tile secondary-hit effect sheets (flame / shrapnel /
pierce).

These are single-column sprite strips: `FRAMES` cells stacked vertically, each
CELL_W x CELL_H, drawn on its own transparent tile so nothing bleeds between
frames (the in-game overlay shows exactly one cell). Geometry mirrors the
explosion sheet so the animator seats them on a tile identically:

  cell = 56 x 96, registered with xOffset -2 / yOffset 36. That parks the 56-wide
  strip ~2px inside the tile and drops the 96-tall cell so its bottom 60px is the
  tile itself. So in cell-local coords the tile square is x:0..56, y:36..96, and
  its centre — where a hit lands — is (TILE_CX, TILE_CY) = (28, 66).

Effects bloom from the tile centre and may rise into the 0..36 headroom above it.
Soft glow comes from radial-gradient stamps composited in painter's order
(outer/dark first, hot core last), the same layering the unit flame uses.
"""
import math
from PIL import Image, ImageDraw

CELL_W, CELL_H = 56, 96
TILE_CX, TILE_CY = 28, 66  # where the hit lands, cell-local

# Radial-gradient stamp cache, keyed by (diameter, color, peak-alpha). A stamp is
# a soft disc: fully `peak` at the centre falling to 0 at the rim (squared falloff
# for a tighter hot core), so overlapping stamps read as volumetric glow.
_STAMPS: dict = {}


def _stamp(diameter: int, color, peak: int) -> Image.Image:
    key = (diameter, color, peak)
    cached = _STAMPS.get(key)
    if cached is not None:
        return cached
    d = max(1, diameter)
    img = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    px = img.load()
    r = d / 2
    for y in range(d):
        for x in range(d):
            dx, dy = (x + 0.5) - r, (y + 0.5) - r
            dist = math.hypot(dx, dy) / r
            if dist >= 1:
                continue
            a = int(peak * (1 - dist) ** 2)
            if a > 0:
                px[x, y] = (color[0], color[1], color[2], a)
    _STAMPS[key] = img
    return img


def blob(img: Image.Image, cx: float, cy: float, rad: float, color, alpha: int, squash: float = 1.0):
    """Composite one soft glow disc centred at (cx, cy). `squash` < 1 flattens it
    vertically to fake the tilted-camera ground plane."""
    d = int(max(1, rad * 2))
    stamp = _stamp(d, color, alpha)
    h = int(max(1, d * squash))
    if h != d:
        stamp = stamp.resize((d, h))
    img.alpha_composite(stamp, (int(cx - d / 2), int(cy - h / 2)))


def new_cell() -> Image.Image:
    return Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))


def assemble(draw_frame, frames: int, out_path: str):
    """Build the vertical strip by drawing each frame on its own cell and pasting
    it at row `f`, then save. `draw_frame(cell, f)` paints frame `f` in place."""
    sheet = Image.new("RGBA", (CELL_W, CELL_H * frames), (0, 0, 0, 0))
    for f in range(frames):
        cell = new_cell()
        draw_frame(cell, f)
        sheet.alpha_composite(cell, (0, f * CELL_H))
    sheet.save(out_path)
    print("wrote", out_path, sheet.size)
