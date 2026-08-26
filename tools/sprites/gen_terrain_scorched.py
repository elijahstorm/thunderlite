#!/usr/bin/env python3
"""Charred Forest terrain tile — pixel-art burn scar left where a Scorcher's flame
razed woodland (see src/lib/Engine/modifiers/burn.ts).

A 20-frame connector-5 (family-border) autotile — the same border-base + inner-corner
scheme the Sea uses, but matched on terrain TYPE instead of the ocean flag (see
spriteConnector). That fixes the jagged concave junctions a plain 4-bit cardinal
autotile leaves: where two arms of a scar meet, the diagonal-aware corner overlays
fill the notch cleanly.

  frames 0-15 : border base states, indexed by spriteConnector.borderDecision — which
                cardinal neighbours are ALSO Charred Forest. Char runs clean to a
                connected edge; a non-connected edge resolves into grass across a
                crisp inked scorch line.
  frames 16-19: inner-corner overlays (TL / BL / BR / TR). The renderer copies only
                the matching quadrant over the base, carving a rounded grass pocket
                where a diagonal neighbour is grass but both flanking cardinals burn.

Drawn, not recoloured: a gritty tileable ash floor, burnt snags along the tree line,
a crisp scorch boundary and soot flecks scattering onto grass. Grass is sampled from
the plains tile so the border meets neighbouring plains seamlessly.

The jagged, wavy scorch line is DELIBERATE and specific to this terrain — fire tears
through a treeline, it does not erode a smooth bank. The natural terrains that share
this autotile (the ore beds, the wasteland bog) take the opposite treatment; see
tools/sprites/terrain_border.py.

VARIANTS (rows) carry the trees that survived standing. A real burn leaves a few big
trunks upright in the middle of the scar, not just a fringe of stumps around its edge,
and those silhouettes are what make a scar read as a burnt FOREST rather than a patch
of ash. They are kept sparse on purpose: two of the four rows have a standing trunk,
one has a fallen log, one is bare, so a scar gets a scattering of them instead of one
per tile. The ash floor and the scorch boundary are identical in every row, so any two
rows still butt together with no seam.
"""
import math
import os

from PIL import Image

BASE = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/terrain"
SRC_PLAINS = f"{BASE}/plains.png"
OUT = f"{BASE}/scorched.png"

CELL = 60
FRAMES = 20  # columns: 16 border-base + 4 inner-corner
VARIANTS = 4  # rows: interchangeable versions of the whole 20-state set

# --- palette (warm ash + charcoal, sharing the ember tones of the VFX sheets) ---
SCORCH_INK = (24, 20, 20)
CHAR = (33, 29, 28)
CHAR_SHADOW = (20, 17, 17)
CHAR_RIM = (92, 82, 74)
SOOT = (50, 45, 43)
ASH_LO = (78, 71, 66)
ASH_MID = (104, 95, 87)
ASH_HI = (138, 127, 116)
SINGE_HI = (96, 96, 48)
SINGE_LO = (60, 56, 32)
EMBER = (196, 82, 28)
EMBER_HOT = (240, 140, 46)

BASE_MARGIN = 8.0    # how far the char pulls back from a grass edge (px)
MARGIN_AMP = 6.0     # wave amplitude of that pull-back
SINGE_W = 4.0        # width of the scorched-grass band outside the ink line

# Sheet column -> (left, up, right, down) neighbour-is-burnt, inverted from
# spriteConnector.borderDecision. Column N must be the tile that decision picks.
INDEX_TO_LURD = {
    0: (True, True, True, True),
    1: (False, True, True, True),
    2: (True, False, True, True),
    3: (True, True, False, True),
    4: (True, True, True, False),
    5: (True, False, False, True),
    6: (False, False, True, True),
    7: (False, False, True, False),
    8: (True, False, False, False),
    9: (False, True, False, False),
    10: (False, False, False, True),
    11: (False, False, False, False),
    12: (True, True, False, False),
    13: (False, True, True, False),
    14: (False, True, False, True),
    15: (True, False, True, False),
}
# The two tile edges whose margins bound each inner-corner frame's grass pocket
# (paint.cornerQuadrant): 16 top-left, 17 bottom-left, 18 bottom-right, 19 top-right.
CORNER_EDGES = {
    16: ("left", "top"),
    17: ("left", "bottom"),
    18: ("right", "bottom"),
    19: ("right", "top"),
}


def hash01(x, y, salt=0):
    n = (x * 374761393 + y * 668265263 + salt * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def wave(coord, phase):
    a = 0.5 + 0.5 * math.sin(2 * math.pi * 2 * coord / CELL + phase)
    b = 0.5 + 0.5 * math.sin(2 * math.pi * 3 * coord / CELL + phase * 1.7 + 1.1)
    return 0.6 * a + 0.4 * b


def margin_top(x):
    return BASE_MARGIN + MARGIN_AMP * wave(x, 0.3)


def margin_bottom(x):
    return BASE_MARGIN + MARGIN_AMP * wave(x, 2.4)


def margin_left(y):
    return BASE_MARGIN + MARGIN_AMP * wave(y, 4.1)


def margin_right(y):
    return BASE_MARGIN + MARGIN_AMP * wave(y, 5.7)


def edge_depth(x, y, L, U, R, D):
    """Signed px into the char for a border-base tile: each grass-facing edge pulls
    the boundary in by its wavy margin; a connected edge imposes no limit."""
    best = 999.0
    if not L:
        best = min(best, x - margin_left(y))
    if not R:
        best = min(best, (CELL - 1 - x) - margin_right(y))
    if not U:
        best = min(best, y - margin_top(x))
    if not D:
        best = min(best, (CELL - 1 - y) - margin_bottom(x))
    return best


# Signed px from each tile edge into the char, using the SAME wavy margin that edge
# uses in the base frames — so a corner pocket built from these lines up seamlessly
# with the neighbouring tiles' edges.
def _edge_depth(edge, x, y):
    if edge == "left":
        return x - margin_left(y)
    if edge == "right":
        return (CELL - 1 - x) - margin_right(y)
    if edge == "top":
        return y - margin_top(x)
    return (CELL - 1 - y) - margin_bottom(x)  # bottom


def corner_depth(x, y, edge_a, edge_b):
    """Signed px into the char for an inner (concave) corner overlay. Grass only
    where BOTH bounding edges say grass (max of the two edge depths) — a small
    notch tucked in the corner. Because each side uses its edge's own margin curve,
    the notch's boundaries continue the neighbour tiles' edges exactly, with no seam
    (contrast the base tile, which uses min → grass along a whole convex edge)."""
    return max(_edge_depth(edge_a, x, y), _edge_depth(edge_b, x, y))


def char_ground(x, y):
    shade = 0.5 + 0.25 * math.sin(2 * math.pi * x / CELL + 0.6) * math.cos(
        2 * math.pi * y / CELL + 1.9
    )
    g = hash01(x, y, 5)
    tone = 0.45 * shade + 0.55 * g
    if g > 0.94:
        col = ASH_HI
    elif tone > 0.66:
        col = ASH_MID
    elif tone > 0.4:
        col = ASH_LO
    else:
        col = SOOT
    vein = math.sin(x * 0.8 + y * 0.55 + 2.0 * math.sin(y * 0.3))
    if abs(vein) < 0.05 and hash01(x, y, 9) > 0.3:
        col = SCORCH_INK
    if col in (SOOT, SCORCH_INK) and hash01(x, y, 3) > 0.978:
        col = EMBER_HOT if hash01(x, y, 4) > 0.5 else EMBER
    return col


def singe_grass(x, y, grass_px):
    r, g, b, _ = grass_px
    target = SINGE_HI if hash01(x, y, 7) > 0.5 else SINGE_LO
    t = 0.6
    return (
        int(r + (target[0] - r) * t),
        int(g + (target[1] - g) * t),
        int(b + (target[2] - b) * t),
        255,
    )


def render_bands(px, gp, depth_fn):
    """Paint one cell from a signed-depth field: char interior, ash rim, inked
    boundary, scorched-grass band, then grass with soot flecks scattering out."""
    for y in range(CELL):
        for x in range(CELL):
            d = depth_fn(x, y)
            if d >= 3:
                px[x, y] = (*char_ground(x, y), 255)
            elif d >= 0.0:
                px[x, y] = (*(SOOT if d < 1.3 else ASH_LO), 255)
            elif d >= -1.4:
                px[x, y] = (*SCORCH_INK, 255)
            elif d >= -SINGE_W:
                px[x, y] = singe_grass(x, y, gp[x, y])
            else:
                near = max(0.0, 1.0 + (d + SINGE_W) / 8.0)
                if near > 0 and hash01(x, y, 2) < near * 0.16:
                    px[x, y] = (*SOOT, 255)


class Brush:
    """Paints only where the cell is actually burnt, judged by the SAME depth field
    the bands were drawn from. That is what lets a standing trunk be drawn into both a
    base frame and an inner-corner overlay: each clips itself to its own char, so the
    quadrant the renderer copies over the base always agrees with what was under it."""

    def __init__(self, img, depth_fn, floor):
        self.px = img.load()
        self.depth = depth_fn
        self.floor = floor

    def put(self, x, y, c):
        if not (0 <= x < CELL and 0 <= y < CELL):
            return
        if self.depth(x, y) < self.floor:
            return
        self.px[x, y] = (c[0], c[1], c[2], 255)


def standing_tree(brush, cx, cy, h, lean, seed):
    """A tree the fire killed but could not bring down: a tall charred trunk, snapped
    off at the top, with the stubs of its lower limbs still on it and embers banked in
    the ash at its foot. Bigger and darker than the edge stumps, because it is meant to
    be the thing your eye lands on in the middle of a scar."""
    def offset(i):
        return int(lean * i * i / (h * 3.4))

    # ash banked around the root, and the shadow the trunk throws down-right
    for dx in range(-5, 6):
        brush.put(cx + dx, cy, ASH_MID if abs(dx) < 3 else ASH_LO)
        brush.put(cx + dx, cy + 1, ASH_LO if abs(dx) < 4 else SOOT)
    for i in range(int(h * 0.75)):
        brush.put(cx + 4 + int(i * 0.25), cy - i, SOOT)

    for i in range(h):
        y = cy - 1 - i
        x = cx + offset(i)
        w = 4 if i < h * 0.3 else 3 if i < h * 0.72 else 2
        brush.put(x - 1, y, CHAR_RIM)  # top-left key light catches the near edge
        for dx in range(w):
            brush.put(x + dx, y, CHAR)
        brush.put(x + w, y, CHAR_SHADOW)
    # snapped crown: a splintered, uneven break rather than a clean tip
    top = cy - 1 - h
    brush.put(cx + offset(h), top, CHAR_RIM)
    brush.put(cx + offset(h) + 1, top + 1, CHAR_RIM)

    # broken limbs, alternating sides and angling up before they stop short
    for start, run, dirx in ((0.34, 7, -lean), (0.58, 6, lean), (0.80, 4, -lean)):
        by = cy - 1 - int(h * start)
        bx = cx + offset(int(h * start)) + (0 if dirx < 0 else 3)
        for i in range(1, run + 1):
            x = bx + dirx * i
            y = by - int(i * 0.85)
            brush.put(x, y, CHAR)
            if i <= run - 2:
                brush.put(x, y - 1, CHAR)
        brush.put(bx + dirx * run, by - int(run * 0.85) - 1, CHAR_RIM)

    # embers still alive in the root ash
    for i in range(3):
        ex = cx - 3 + int(hash01(i, seed, 4) * 7)
        if hash01(i, seed, 5) > 0.35:
            brush.put(ex, cy, EMBER_HOT if hash01(i, seed, 6) > 0.5 else EMBER)


def fallen_log(brush, x0, y0, x1, y1, seed):
    """A trunk the fire did bring down: lying at an angle across the ash, thickest at
    the torn-up root end and splintered where it snapped. Drawn tapered and off the
    horizontal on purpose — a straight even bar reads as a fence rail, not a tree."""
    steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(steps):
        t = i / max(1, steps - 1)
        x = int(x0 + (x1 - x0) * t)
        y = int(y0 + (y1 - y0) * t + 1.2 * math.sin(t * 3 + seed))
        w = 4 - int(t * 2.4)  # tapers from the root end to the break
        brush.put(x, y - w, CHAR_RIM)
        for dy in range(-w + 1, w):
            brush.put(x, y + dy, CHAR)
        brush.put(x, y + w, CHAR_SHADOW)
        brush.put(x, y + w + 1, SOOT)
        if hash01(x, y, seed) > 0.90:
            brush.put(x, y, EMBER if hash01(x, y, seed + 1) > 0.5 else CHAR_RIM)
    # root plate torn out of the ground, still attached at the thick end
    for dy in range(-5, 6):
        for dx in range(-3, 2):
            if dx * dx * 2 + dy * dy <= 22 and hash01(dx, dy, seed + 2) > 0.35:
                brush.put(x0 + dx, y0 + dy, CHAR if abs(dy) < 4 else CHAR_SHADOW)


# Per-variant decoration. Deliberately thin: two rows carry a standing trunk, one a
# fallen log, one nothing, so a scar shows a few survivors rather than a forest of them.
VARIANT_TREES = {
    0: lambda b: standing_tree(b, 26, 44, h=23, lean=-1, seed=7),
    1: lambda b: None,
    2: lambda b: standing_tree(b, 35, 46, h=19, lean=1, seed=19),
    3: lambda b: fallen_log(b, 17, 24, 44, 42, seed=31),
}


def stump(px, cx, cy, seed):
    def put(x, y, c):
        if 0 <= x < CELL and 0 <= y < CELL:
            px[x, y] = (*c, 255)

    h = 9 + int(hash01(seed, 1) * 4)
    lean = -1 if hash01(seed, 5) > 0.6 else 0
    for dx in range(-3, 2):
        put(cx + dx - 1, cy + 1, ASH_LO if hash01(cx + dx, cy, 2) > 0.4 else SOOT)
    for dx in range(-2, 3):
        put(cx + dx, cy, ASH_MID if dx == 0 else ASH_LO)
    for i in range(h):
        y = cy - 1 - i
        x0 = cx + int(lean * i / h)
        tw = 1 if i > h * 0.55 else 2
        put(x0 - 1, y, CHAR_SHADOW)
        for dx in range(0, tw):
            put(x0 + dx, y, CHAR)
        put(x0 + tw, y, CHAR_RIM)
    put(cx + int(lean), cy - 1 - h, CHAR_RIM)
    if hash01(seed, 6) > 0.35:
        by = cy - 1 - int(h * 0.55)
        put(cx + 2, by, CHAR)
        put(cx + 3, by - 1, CHAR_RIM)
    if hash01(seed, 8) > 0.4:
        put(cx, cy, EMBER_HOT)
        put(cx - 1, cy, EMBER)


def edge_stumps(px, L, U, R, D):
    """The tree line where the fire stopped: a few stumps just inside each open edge.

    Gated to roughly half the candidate positions, and skipped entirely on a tile whose
    char has pulled back from several sides at once. Drawing every position ringed a
    small scar in black stumps, which buried the ash and read as a fence rather than as
    the edge of a burnt wood — the standing trees in the middle are meant to be what
    the eye lands on.
    """
    open_edges = (0 if L else 1) + (0 if U else 1) + (0 if R else 1) + (0 if D else 1)
    if open_edges >= 3:
        return
    if not U:
        for x in range(11, CELL - 8, 23):
            if hash01(x, 21) < 0.5:
                continue
            xx = x + int(hash01(x, 11) * 8)
            stump(px, xx, int(margin_top(xx)) + 2, seed=xx * 3 + 1)
    if not D:
        for x in range(11, CELL - 8, 23):
            if hash01(x, 22) < 0.5:
                continue
            xx = x + int(hash01(x, 12) * 8)
            stump(px, xx, CELL - 1 - int(margin_bottom(xx)) + 1, seed=xx * 3 + 2)
    if not L:
        for y in range(13, CELL - 10, 24):
            if hash01(y, 23) < 0.5:
                continue
            yy = y + int(hash01(y, 13) * 8)
            stump(px, int(margin_left(yy)) + 2, yy, seed=yy * 3 + 3)
    if not R:
        for y in range(13, CELL - 10, 24):
            if hash01(y, 24) < 0.5:
                continue
            yy = y + int(hash01(y, 14) * 8)
            stump(px, CELL - 1 - int(margin_right(yy)), yy, seed=yy * 3 + 4)


# The trees clip to char at least this deep, so a trunk never leans out onto grass.
TREE_FLOOR = 5.0


def build_cell(grass, depth_fn, variant, base_edges=None):
    cell = grass.copy()
    render_bands(cell.load(), grass.load(), depth_fn)
    if base_edges is not None:
        edge_stumps(cell.load(), *base_edges)
    VARIANT_TREES[variant](Brush(cell, depth_fn, TREE_FLOOR))
    return cell


def main():
    plains = Image.open(SRC_PLAINS).convert("RGBA")
    grass = plains.crop((0, 0, CELL, CELL))

    sheet = Image.new("RGBA", (CELL * FRAMES, CELL * VARIANTS), (0, 0, 0, 0))
    for variant in range(VARIANTS):
        for idx in range(FRAMES):
            if idx in INDEX_TO_LURD:
                L, U, R, D = INDEX_TO_LURD[idx]
                depth_fn = lambda x, y, a=L, b=U, c=R, e=D: edge_depth(x, y, a, b, c, e)
                cell = build_cell(grass, depth_fn, variant, base_edges=(L, U, R, D))
            else:
                ea, eb = CORNER_EDGES[idx]
                depth_fn = lambda x, y, a=ea, b=eb: corner_depth(x, y, a, b)
                cell = build_cell(grass, depth_fn, variant)
            sheet.paste(cell, (idx * CELL, variant * CELL))
    sheet.save(OUT)
    print("wrote", OUT, sheet.size)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    main()
