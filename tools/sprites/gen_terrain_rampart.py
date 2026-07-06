#!/usr/bin/env python3
"""Rampart terrain tile — an impassable fortification that also blocks indirect fire
from reaching a unit sheltered behind it (see the Bulwark modifier in
src/lib/GameData/modifier.ts and the shadow it casts in Engine/lineOfSight.ts).

Connector 2 (random) like Forest / Mountain: a 5-column 300x60 sheet, one 60x60
variant picked per tile by `location % 5` (spriteConnector.random). All five are the
SAME motif — a riveted steel armour-plate barricade with a painted hazard stripe —
differing only in battle damage, so a run of ramparts reads as one emplacement taking
fire rather than five different props:

  0  pristine plate          3  scorched, hazard stripe scorched over
  1  dented, bullet-pocked    4  heavy: a shell hole torn through, peeled lip
  2  a shell hole punched

Drawn to match the tileset's 2.5D read (see building/ and mountain.png): the plate is
an oblique box with a bright TOP edge receding up-and-right, a mid FRONT and a
shadowed RIGHT side, under a single top-LEFT key light, and a near-black silhouette
outline (as the buildings carry). Seated on a grass base cropped from plains.png, with
a soft cast shadow that hugs the foot and sits back so the plate grounds instead of
hovering over a centred puddle.
"""
import math
import os

from PIL import Image

BASE = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/terrain"
SRC_PLAINS = f"{BASE}/plains.png"
OUT = f"{BASE}/rampart.png"

CELL = 60
VARIANTS = 5

OUTLINE = (26, 22, 30)  # near-black silhouette ink, as the building sprites use

# 4x4 ordered-dither matrix (normalised 0..1) for banded, crunchy gradients.
BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]

# palettes (dark -> bright)
STEEL = [(40, 44, 52), (86, 92, 104), (140, 148, 160), (198, 204, 214)]
HAZARD = [(38, 34, 20), (214, 182, 46)]  # painted black / caution-yellow
VOID = [(18, 20, 24), (32, 34, 40)]  # torn-open interior of a shell hole
RUST = (150, 92, 56)


def hash01(x, y, salt=0):
    n = (x * 374761393 + y * 668265263 + salt * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


class Cell:
    """A 60x60 RGBA cell painted over a grass base, tracking which pixels are the
    structure (`solid`) so the outline pass can ink its silhouette afterwards."""

    def __init__(self, grass):
        self.img = grass.copy()
        self.px = self.img.load()
        self.solid = set()

    def put(self, x, y, c, structure=True):
        if 0 <= x < CELL and 0 <= y < CELL:
            self.px[x, y] = (c[0], c[1], c[2], 255)
            if structure:
                self.solid.add((x, y))

    def darken(self, x, y, f):
        if 0 <= x < CELL and 0 <= y < CELL:
            r, g, b, a = self.px[x, y]
            self.px[x, y] = (int(r * (1 - f)), int(g * (1 - f)), int(b * (1 - f)), a)

    def shade(self, x, y, pal, light, structure=True):
        t = clamp(light, 0.0, 1.0) * (len(pal) - 1)
        lvl = int(t)
        frac = t - lvl
        if lvl >= len(pal) - 1:
            self.put(x, y, pal[-1], structure)
            return
        idx = lvl + (1 if frac > BAYER[y % 4][x % 4] / 16.0 else 0)
        self.put(x, y, pal[min(idx, len(pal) - 1)], structure)

    def outline(self):
        edge = [
            (x, y)
            for (x, y) in self.solid
            if (x - 1, y) not in self.solid
            or (x + 1, y) not in self.solid
            or (x, y - 1) not in self.solid
            or (x, y + 1) not in self.solid
        ]
        for (x, y) in edge:
            self.px[x, y] = (*OUTLINE, 255)


# oblique box: front + top(receding up-right) + shadowed right side, top-left key
def box3d(cell, x0, x1, y_top, y_base, depth, skew, pal):
    w = max(1, x1 - x0)
    h = max(1, y_base - y_top)
    for y in range(y_top, y_base + 1):
        for x in range(x0, x1 + 1):
            light = 0.52 - 0.24 * ((y - y_top) / h) + 0.14 * (1 - (x - x0) / w)
            light += 0.04 * (hash01(x, y, 1) - 0.5)
            cell.shade(x, y, pal, light)
    for k in range(1, skew + 1):
        x = x1 + k
        dy = round(depth * k / skew)
        for y in range(y_top - dy, y_base - dy + 1):
            cell.shade(x, y, pal, 0.24 + 0.05 * (hash01(x, y, 2) - 0.5))
    for j in range(1, depth + 1):
        y = y_top - j
        xa = x0 + round(skew * j / depth)
        xb = x1 + round(skew * j / depth)
        for x in range(xa, xb + 1):
            cell.shade(x, y, pal, 0.86 - 0.12 * (j / depth) + 0.05 * (hash01(x, y, 3) - 0.5))


def ground_shadow(cell):
    """Soft contact shadow hugging the foot, biased up-and-right (behind) so the plate
    grounds rather than floating over a centred blob."""
    fp = cell.solid
    if not fp:
        return
    xs = [x for (x, y) in fp]
    ys = [y for (x, y) in fp]
    cx = (min(xs) + max(xs)) / 2
    base = max(ys)
    half = (max(xs) - min(xs)) / 2 + 3
    ecx, ecy, ew, eh = cx + 3, base - 2, half, 6
    for y in range(base - 8, base + 4):
        for x in range(int(ecx - ew - 1), int(ecx + ew + 2)):
            if (x, y) in fp:
                continue
            nx, ny = (x - ecx) / ew, (y - ecy) / eh
            d = nx * nx + ny * ny
            if d > 1:
                continue
            cell.darken(x, y, 0.42 * (1 - d) ** 0.6)


# --- the steel-barricade motif --------------------------------------------
# X0/X1 are the FRONT face; the oblique skew adds ~5px up-and-right, so the front is
# parked left-of-centre and the full silhouette (front + skewed top/side) centres on
# the 60px tile.
X0, X1, TOP, BOT = 8, 46, 15, 54
SEAM = 27  # vertical panel seam (centre of the front face)


def rivet_row(cell, y):
    for rx in range(X0 + 2, X1, 5):
        cell.put(rx, y, STEEL[3])       # lit head
        cell.put(rx, y + 1, STEEL[0])   # shadow under


def draw_plate(cell):
    box3d(cell, X0, X1, TOP, BOT, 6, 5, STEEL)
    # two bolted reinforcement ribs across the plate
    for by in (TOP + 4, BOT - 5):
        for x in range(X0, X1 + 1):
            cell.shade(x, by - 1, STEEL, 0.85)  # lit top of rib
            cell.shade(x, by, STEEL, 0.5)
            cell.shade(x, by + 1, STEEL, 0.18)  # shadow below
        rivet_row(cell, by)
    # central vertical panel seam
    for y in range(TOP, BOT + 1):
        cell.shade(SEAM, y, STEEL, 0.15)
        cell.shade(SEAM + 1, y, STEEL, 0.78)


def hazard_stripe(cell, burned=0.0):
    for y in range(TOP + 6, TOP + 11):
        for x in range(X0 + 2, X1 - 1):
            if x in (SEAM, SEAM + 1):
                continue
            cell.put(x, y, HAZARD[((x - y) // 3) % 2])
            if burned and hash01(x, y, 11) < burned:  # sooted over
                cell.darken(x, y, 0.6)


def pock(cell, x, y):
    """A bullet pock: a small punched dimple, dark with a bright top-left rim."""
    for (dx, dy) in ((0, 0), (1, 0), (0, 1)):
        if (x + dx, y + dy) in cell.solid:
            cell.px[x + dx, y + dy] = (54, 58, 66, 255)
    if (x - 1, y - 1) in cell.solid:
        cell.px[x - 1, y - 1] = (*STEEL[3], 255)


def dent(cell, cx, cy, rx, ry):
    """A shallow concave dent: darkened bowl, with the far (lower-right) lip catching
    the top-left key as a thin highlight."""
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if (x, y) not in cell.solid:
                continue
            nx, ny = (x - cx) / rx, (y - cy) / ry
            d = nx * nx + ny * ny
            if d > 1:
                continue
            cell.darken(x, y, 0.30 * (1 - d))
            if 0.62 < d <= 1.0 and nx + ny > 0.6:  # lit far lip
                cell.shade(x, y, STEEL, 0.9)


def scorch(cell, x0, x1, y0, y1, amt):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if (x, y) in cell.solid and hash01(x, y, 9) < amt:
                cell.darken(x, y, 0.45)


def shell_hole(cell, hx, hy, rx, ry, peel=False):
    """A shell torn through the plate: a dark ragged void, jagged bright torn-metal
    lips around it, rust weeping at the edge, and optionally a peeled-back flap."""
    for y in range(hy - ry - 2, hy + ry + 3):
        for x in range(hx - rx - 2, hx + rx + 3):
            if (x, y) not in cell.solid:
                continue
            nx, ny = (x - hx) / rx, (y - hy) / ry
            d = nx * nx + ny * ny + 0.18 * (hash01(x, y, 41) - 0.5)  # ragged edge
            if d <= 1.0:
                cell.px[x, y] = (*(VOID[0] if d < 0.5 else VOID[1]), 255)
            elif d <= 1.4:  # torn lip: alternating bright shards and shadow
                if hash01(x, y, 42) > 0.45:
                    cell.px[x, y] = (*STEEL[3], 255)
                else:
                    cell.darken(x, y, 0.45)
    for i in range(4):  # rust weeping down from the wound
        a = 2 * math.pi * hash01(i, hx, 7)
        x, y = int(hx + math.cos(a) * rx * 1.15), int(hy + abs(math.sin(a)) * ry * 1.15)
        if (x, y) in cell.solid:
            cell.px[x, y] = (*RUST, 255)
    if peel:  # a flap of plate bent outward, catching the key light
        for i in range(5):
            x, y = hx - rx - i, hy - i
            cell.put(x, y, STEEL[3] if i < 3 else STEEL[2])
            cell.put(x, y + 1, STEEL[1])


def sample_grass(cell):
    """Grab dark/mid/light grass tones from the still-untouched corners, so the
    settling blades below are drawn in the tile's own grass, not a fixed green."""
    pts = ((1, 1), (3, 2), (57, 1), (1, 57), (58, 58), (30, 1), (1, 30))
    cols = sorted((cell.px[x, y][:3] for (x, y) in pts), key=sum)
    return cols[0], cols[len(cols) // 2], cols[-1]


def grass_fold(cell, tones):
    """Settle the plate into the turf: a thin band of matted (pressed-down, darker)
    grass hugging the foot, plus blades folding up over the front-bottom edge so the
    barricade reads as weighing the grass down, not resting on top of it."""
    dark, mid, lite = tones
    base = BOT
    # matted ring just outside the foot
    for x in range(X0 - 3, X1 + 8):
        for dy in range(0, 3):
            y = base + 1 + dy
            if (x, y) in cell.solid:
                continue
            if hash01(x, y, 55) < 0.7 - 0.2 * dy:
                cell.darken(x, y, 0.13)
    # blades folding up over the front-bottom edge
    for x in range(X0 - 1, X1 + 5):
        if hash01(x, 0, 56) > 0.5:
            continue
        h = 3 + int(hash01(x, 1, 57) * 3)  # 3..5 tall
        lean = 1 if hash01(x, 2, 58) > 0.5 else -1
        for i in range(h):
            bx = x + lean * (i // 2)
            by = base + 1 - i
            col = lite if i >= h - 1 else (mid if i >= 1 else dark)
            if 0 <= bx < CELL and 0 <= by < CELL:
                cell.px[bx, by] = (*col, 255)


def rampart(cell, v):
    tones = sample_grass(cell)
    draw_plate(cell)
    hazard_stripe(cell, burned=0.55 if v == 3 else 0.0)

    if v == 1:
        for (px, py) in ((14, 30), (19, 45), (35, 25), (41, 46), (13, 49), (38, 37)):
            pock(cell, px, py)
        dent(cell, 32, 40, 7, 5)
    elif v == 2:
        shell_hole(cell, 18, 35, 6, 5)
        scorch(cell, X0, 31, 28, 52, 0.24)
        pock(cell, 39, 30)
        pock(cell, 42, 44)
    elif v == 3:
        scorch(cell, X0, X1, TOP, BOT, 0.20)
        for (px, py) in ((16, 44), (37, 26), (41, 40)):
            pock(cell, px, py)
        shell_hole(cell, 40, 43, 4, 3)
    elif v == 4:
        dent(cell, 15, 45, 7, 5)
        shell_hole(cell, 27, 35, 9, 7, peel=True)
        scorch(cell, X0, X1, 24, 52, 0.26)

    cell.outline()
    ground_shadow(cell)  # now that the silhouette exists, cast it on the grass
    grass_fold(cell, tones)  # blades sit over the outline so it nestles into the turf


def main():
    plains = Image.open(SRC_PLAINS).convert("RGBA")
    grass = plains.crop((0, 0, CELL, CELL))

    sheet = Image.new("RGBA", (CELL * VARIANTS, CELL), (0, 0, 0, 0))
    for i in range(VARIANTS):
        cell = Cell(grass)
        rampart(cell, i)
        sheet.paste(cell.img, (i * CELL, 0))
    sheet.save(OUT)
    print("wrote", OUT, sheet.size)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    main()
