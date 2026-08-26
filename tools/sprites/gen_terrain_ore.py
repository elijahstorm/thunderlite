#!/usr/bin/env python3
"""Ore Deposit terrain tiles — the three richness steps of one mineral bed
(Enriched / Ore / Depleted, see src/lib/GameData/terrain.ts).

Ore is the map's economy, so deposits get placed in clusters and a player stares at
them all match. These are connector-5 (family-border) sheets: the same border-base +
inner-corner autotile the Charred Forest uses (spriteConnector), but matched on
terrain FAMILY rather than type — all three richness steps declare `family: 'ore'`,
so a worked-out patch and a rich one share one continuous outcrop instead of each
cutting an edge into the other.

  columns (20)  border/corner states
    0-15  : border base states, indexed by spriteConnector.borderDecision — which
            cardinal neighbours are also ore. Rock runs clean to a connected edge; an
            open edge falls away through a soil apron into grass.
    16-19 : inner-corner overlays (TL / BL / BR / TR). The renderer copies only the
            matching quadrant, carving a grass pocket where a diagonal neighbour is
            grass but both flanking cardinals are ore.
  rows (VARIANTS) one interchangeable version of the whole 20-state set, picked per
            tile by spriteConnector.variantDecision. Static sheets (frames = 1), so a
            variant is exactly one row.

DRAWN IN THE TILESET'S LANGUAGE, not as a procedural texture. Blown up, the hand-
authored tiles are a short ramp of well-separated tones laid down as irregular
clustered patches with hard edges, with a dark anchor, and with their props carrying a
near-black silhouette. So:

  * The rock is massed into a few large areas by a smooth swell sampled once per
    Voronoi cell (terrain_texture.cell_field), then MOTTLED so no area is ever flat —
    the Mountain tile's face is irregular 2-6px patches of the neighbouring ramp tones,
    and that is what is imitated here.
  * MATERIAL GETS FORM SHADING, PROPS GET OUTLINES. The rock takes a step-shadow only
    where a raised mass drops away to the lower right; the ore lumps and hollows sitting
    on it take a full ink silhouette. Outlining the rock too reads as a mosaic of props;
    form-shading the props leaves them mushy.
  * The outer boundary into grass is an ordered dither, not per-pixel jitter — same
    softness, but it reads as a deliberate pixel edge rather than as grain.

RICHNESS IS THE ROCK, not just what is scattered on it. A full deposit is a solid
unbroken outcrop with ore seams running through it; mining it out is what breaks it up.
The three sheets share every mass, seam and pocket position and differ in:

  Enriched : calm unbroken rock, seams whole, pockets packed with bright crystal, and
             the only sheet that sparkles
  Ore      : fractures opening across a busier surface, most of the seam already chased
             out, the metal that is left gone dull, no shine anywhere
  Depleted : broken down to loose stone, every pocket a hollow, no metal at all

Three separate cues carry that, because ONE does not: an earlier pass distinguished the
sheets by fracture alone and the first two were hard to tell apart at a glance. So the
rock's TEXTURE calms down as well (Enriched drops the fine mottling scale, which makes
the cracks appearing on Ore read as a change of surface, not just added lines), the
metal's PALETTE steps down a rung (bright gold to a tarnished brown), and the SPARKLE
belongs to Enriched alone.

Seamlessness: the outline and its margins are shared by ALL variants and all three
sheets (terrain_border), the mottling is shared outright, and both Voronoi fields
reseed only their interiors. Props are a pure function of (variant, x, y) clipped to
the rock, so a base frame and a corner overlay from the same row always agree.

Palette: five well-separated rock steps plus an ink, four for the metal, two for the
soil apron. An earlier pass here spent nineteen colours per tile on near-duplicates;
the Mountain tile spends about seven on its rock alone, so the budget was never the
problem, close-together tones were.
"""
import math
import os

from terrain_border import Border, depth_for_state
from terrain_texture import (
    CELL,
    bayer,
    cell_field,
    edge_field,
    hash01,
    massing,
    mottle,
    ramp_at,
)
from PIL import Image

BASE = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/terrain"
SRC_PLAINS = f"{BASE}/plains.png"

VARIANTS = 5  # rows: interchangeable versions of the whole 20-state set
STATES = 20   # columns: 16 border-base + 4 inner-corner

# --- palette -------------------------------------------------------------------
INK = (26, 38, 48)
ROCK_DEEP = (36, 58, 70)
ROCK_DARK = (48, 74, 88)
ROCK_MID = (86, 112, 122)
ROCK_LIGHT = (124, 150, 162)
ROCK_PALE = (158, 180, 190)
ORE_DEEP = (74, 56, 30)
ORE_DARK = (120, 88, 44)
ORE_MID = (188, 154, 60)
ORE_LIGHT = (232, 208, 112)
ORE_GLINT = (252, 250, 210)
SOIL_DARK = (96, 92, 62)
SOIL_LIGHT = (126, 122, 84)

# The rock ramp, dark to light. A mass sits on one step and the mottling moves pixels
# one step either way, so the whole face lives in five values.
RAMP = (ROCK_DEEP, ROCK_DARK, ROCK_MID, ROCK_LIGHT, ROCK_PALE)
LEVEL_STEP = {0: 1, 1: 2, 2: 3}  # mass level -> index into RAMP

# A rounded outcrop, not a ripped hole. The Charred Forest wants the opposite; see
# terrain_border for why.
BORDER = Border(base=7.5, amp=2.6, phases=(0.4, 1.2, 5.1, 3.9), round_k=11.0)

ROCK_D = 1.6      # depth at which the soil apron gives way to rock
SOIL_D = -1.6     # depth at which the apron gives way to grass
ROCK_FADE = 2.5   # width of the ordered-dither ramp at the rock edge
SOIL_FADE = 2.0   # width of the ordered-dither ramp at the grass edge
DECO_D = ROCK_D + 2.0  # props only land this deep or deeper

# Masses: one long swell per tile plus a half swell, banded into three levels.
MASS_GRID = 8
MASS_RING = 2
_mass_value = massing(
    harmonics=((0.30, 1, 1, 1.0), (0.16, 2, 1, -0.7)),
    thresholds=(0.38, 0.60),
)
_mass_cache = {}

# Fractures: a finer field whose cell BOUNDARIES are the cracks. Ring 3, wider than the
# masses need, because a boundary depends on the two nearest cells and both have to be
# shared ones at a tile border for two variants to agree there.
FRACTURE_GRID = 10
FRACTURE_RING = 3
RIDGE = 0.95
_fracture_cache = {}


def masses(variant):
    if variant not in _mass_cache:
        _mass_cache[variant] = cell_field(
            MASS_GRID, MASS_RING, variant, 61, _mass_value(variant)
        )
    return _mass_cache[variant]


def fractures(variant):
    if variant not in _fracture_cache:
        _fracture_cache[variant] = edge_field(FRACTURE_GRID, FRACTURE_RING, variant, 71)
    return _fracture_cache[variant]


def _fracture_open(a, b, breakup):
    """Whether the fracture between these two plates has opened yet.

    Keyed on the PAIR of plates, not on the pixel, so a fracture opens along its whole
    length at once. Thresholding the ridge width directly made a part-worked deposit
    look speckled with dashes, because only the very centre of each ridge cleared."""
    lo, hi = (a, b) if a < b else (b, a)
    return hash01(lo, hi, 33) < breakup


def rock_pixel(x, y, variant, breakup, fine):
    """Mottled rock, worked over by however much of the fracture field has opened.

    At breakup 0 the plates are invisible and the outcrop is one piece. As it rises,
    whole fractures ink in one after another and the stone below each one catches light
    on its upper edge — which is what turns a crack network into a field of separate
    stones rather than a grid drawn on a slab.
    """
    lvl = masses(variant)
    level = lvl[y][x]
    step = LEVEL_STEP[level] + mottle(x, y, fine)

    if breakup > 0.0:
        field = fractures(variant)
        ridge, a, b = field[y][x]
        if ridge < RIDGE and _fracture_open(a, b, breakup):
            return INK if ridge < RIDGE * 0.45 else ROCK_DEEP
        if breakup > 0.5 and y > 0:
            ridge_up, au, bu = field[y - 1][x]
            if ridge_up < RIDGE and _fracture_open(au, bu, breakup):
                step += 1

    # Step-shadow where a raised mass drops away to the lower right, under the single
    # top-left key light the whole tileset is drawn with. Only the raised level casts:
    # shading every boundary is what made an early pass read as flagstones.
    if level < 2:
        for dx, dy in ((-1, 0), (0, -1), (-1, -1)):
            if lvl[(y + dy) % CELL][(x + dx) % CELL] == 2:
                return ROCK_DARK if level == 1 else INK
    return ramp_at(RAMP, step)


def bedding(x, y):
    """Bedding planes running through the outcrop: the rock's grain, as a few
    deliberate strokes rather than per-pixel noise. Each is periodic over one CELL in
    x, so it runs unbroken across a horizontal seam."""
    for y0, amp, phase in ((14, 3.4, 0.4), (31, 4.2, 2.3), (47, 3.0, 4.1)):
        if abs(y - (y0 + amp * math.sin(2 * math.pi * x / CELL + phase))) < 0.6:
            return True
    return False


def soil(x, y):
    return SOIL_LIGHT if bayer(x + 2, y + 1) > 0.45 and mottle(x, y) >= 0 else SOIL_DARK


def render_bands(px, gp, depth_fn, variant, breakup, fine):
    """Paint one cell: rock, a soil apron, then grass. Both boundaries are ordered
    dithers, so the patch stipples into the turf instead of being outlined against it."""
    for y in range(CELL):
        for x in range(CELL):
            d = depth_fn(x, y)
            b = bayer(x, y)
            if (d - ROCK_D) / ROCK_FADE > b:
                col = rock_pixel(x, y, variant, breakup, fine)
                if bedding(x, y):
                    # cuts two steps below whatever it crosses, so it stays legible
                    # over the mottling instead of vanishing into it
                    col = ramp_at(
                        RAMP, LEVEL_STEP[masses(variant)[y][x]] + mottle(x, y, fine) - 2
                    )
                px[x, y] = (*col, 255)
            elif (d - SOIL_D) / SOIL_FADE > b:
                px[x, y] = (*soil(x, y), 255)
            else:
                px[x, y] = gp[x, y]


# --- props ---------------------------------------------------------------------

class Brush:
    def __init__(self, img, depth_fn):
        self.px = img.load()
        self.depth = depth_fn

    def put(self, x, y, c):
        if not (0 <= x < CELL and 0 <= y < CELL):
            return
        if self.depth(x, y) < DECO_D:
            return
        self.px[x, y] = (c[0], c[1], c[2], 255)


def _facet_outline(cx, cy, r, seed, sides=5):
    """An angular silhouette — a few straight-ish sides rather than an ellipse, so the
    prop reads as cut stone or cut crystal instead of as a soft lump."""
    step = 2 * math.pi / sides

    def inside(x, y, grow=0.0):
        nx, ny = (x - cx) / (r + grow), (y - cy) / (r * 0.88 + grow)
        ang = math.atan2(ny, nx)
        a = (ang + math.pi + seed) % step - step / 2
        return math.hypot(nx, ny) * math.cos(a) <= math.cos(step / 2) * (
            1.0 + 0.07 * math.sin(ang * 2 + seed)
        )

    return inside


# The three facet planes of a crystal, as (direction, tone). A pixel takes the tone of
# whichever plane it faces, which gives straight facet joins rather than the smooth
# terminator a dot product alone produces.
FACETS_BRIGHT = (
    ((-0.60, -0.80), ORE_LIGHT),
    ((0.95, -0.32), ORE_MID),
    ((0.10, 0.99), ORE_DARK),
)
# The same crystal one rung down the ramp: what is left in a worked bed is the poorer
# metal, and dropping its whole facet set is what makes a full deposit read as richer
# at a glance rather than merely less cracked.
FACETS_DULL = (
    ((-0.60, -0.80), ORE_MID),
    ((0.95, -0.32), ORE_DARK),
    ((0.10, 0.99), ORE_DEEP),
)


def crystal(brush, cx, cy, r, seed, rich):
    """A lump of raw ore, cut as a crystal: full ink silhouette, three straight flat
    facets, and — only in a full deposit — a hard specular pixel. Drawn the way the
    Forest tile draws a tree clump, which is what puts it in the same world as the rest
    of the set."""
    facets = FACETS_BRIGHT if rich == 2 else FACETS_DULL
    inside = _facet_outline(cx, cy, r, seed)
    for y in range(cy - r - 3, cy + r + 4):
        for x in range(cx - r - 3, cx + r + 4):
            if not inside(x, y, 1.1):
                continue
            if not inside(x, y):
                brush.put(x, y, INK)
                continue
            dx, dy = (x - cx) / r, (y - cy) / max(1.0, r * 0.88)
            best, col = -9.0, facets[0][1]
            for (nxv, nyv), tone in facets:
                dot = dx * nxv + dy * nyv
                if dot > best:
                    best, col = dot, tone
            brush.put(x, y, col)
    if rich == 2:
        brush.put(cx - int(r * 0.35), cy - int(r * 0.5), ORE_GLINT)
        brush.put(cx - int(r * 0.35) + 1, cy - int(r * 0.5), ORE_LIGHT)


def hollow(brush, cx, cy, r, seed):
    """What is left when a pocket has been taken out: an inked socket with a chipped
    bright lip on the lit side, and its spoil tipped out below as chunky stones."""
    inside = _facet_outline(cx, cy, r, seed, sides=6)
    for y in range(cy - r - 3, cy + r + 4):
        for x in range(cx - r - 3, cx + r + 4):
            if not inside(x, y, 1.2):
                continue
            if not inside(x, y):
                brush.put(x, y, INK)
                continue
            dx, dy = (x - cx) / r, (y - cy) / max(1.0, r * 0.88)
            brush.put(x, y, ROCK_DEEP if dx * 0.6 + dy * 0.8 < 0.1 else INK)
    for i in range(-r, r + 1):
        if hash01(i, seed, 4) > 0.35:
            brush.put(cx + i, cy - r - 2, ROCK_PALE)
    for i in range(4):
        sx = cx + int((hash01(i, seed, 6) - 0.5) * 11)
        sy = cy + r + 2 + int(hash01(i, seed, 7) * 3)
        brush.put(sx, sy, ROCK_LIGHT)
        brush.put(sx + 1, sy, ROCK_MID)
        brush.put(sx, sy + 1, ROCK_DARK)


def sparkle(brush, cx, cy, big):
    """A hard four-point star. Unlike everything else here it needs no outline: it is
    pure light, so it is drawn as light — one white core, bright arms, no ramp."""
    brush.put(cx, cy, ORE_GLINT)
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        brush.put(cx + dx, cy + dy, ORE_GLINT if big else ORE_LIGHT)
    if big:
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
            brush.put(cx + dx, cy + dy, ORE_LIGHT)


def seam(brush, path, half, rich, seed):
    """One ore seam: an inked band with three flat gold facets across it, pinching and
    swelling along its length and breaking now and then, so it reads as metal chased
    through stone rather than as a ribbon laid on top of it.

    A part-worked deposit has stretches already chased out, which show as the empty
    groove; a spent one has nothing left in it anywhere."""
    pts = []
    for i in range(len(path) - 1):
        (x0, y0), (x1, y1) = path[i], path[i + 1]
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for k in range(n):
            t = k / max(1, n - 1)
            pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    for i, (fx, fy) in enumerate(pts):
        if hash01(i // 9, int(seed * 7), 3) > 0.86:
            continue
        mined = rich == 0 or (rich == 1 and hash01(i // 8, int(seed * 7), 9) > 0.28)
        swell = 0.5 + 0.5 * math.sin(i * 0.28 + seed * 2.1)
        w = max(0, int(round(half * swell)))
        if 3 > i or i > len(pts) - 4:
            w = 0
        x, y = int(fx), int(fy + 0.9 * math.sin(i * 0.13 + seed))
        brush.put(x, y - w - 1, INK)
        brush.put(x, y + w + 1, INK)
        for dy in range(-w, w + 1):
            if mined:
                brush.put(x, y + dy, ROCK_DEEP if dy else INK)
            elif rich == 2:
                brush.put(x, y + dy, ORE_LIGHT if dy < 0 else ORE_MID if dy == 0 else ORE_DARK)
            else:
                brush.put(x, y + dy, ORE_MID if dy < 0 else ORE_DARK if dy == 0 else ORE_DEEP)
        if mined:
            brush.put(x, y - w - 1, ROCK_PALE)
        elif rich == 2:
            if w > 0 and i % 7 == 3:
                brush.put(x, y - w, ORE_LIGHT)
            if i % 17 == 8:
                brush.put(x, y - w, ORE_GLINT)


# Per-variant layout, deliberately unalike in ORIENTATION and in how much ore it
# carries. Three tiles that each ran a seam across their middle banded a whole field
# into horizontal stripes, so the set now mixes shallow, steep, stub and none. Pockets
# are shared across the three sheets: the same mine face, worked to different depths.
# Props stay inset from the tile edge so a connected seam never halves one.
LAYOUT = {
    0: {
        "seam": [(3, 44), (24, 37), (44, 43), (57, 36)],
        "pockets": [(20, 20, 5), (45, 24, 4)],
        "sparks": [(37, 26, True), (12, 33, False), (52, 45, False)],
    },
    1: {
        "seam": [(24, 2), (31, 22), (26, 40), (34, 57)],
        "pockets": [(45, 30, 5), (14, 45, 4)],
        "sparks": [(16, 22, True), (44, 48, False), (36, 12, False)],
    },
    2: {
        "seam": [(38, 16), (49, 26)],
        "pockets": [(18, 32, 5), (30, 47, 4)],
        "sparks": [(45, 40, True), (24, 16, False), (10, 22, False)],
    },
    3: {
        "seam": None,
        "pockets": [(30, 28, 6), (16, 46, 4), (46, 44, 4)],
        "sparks": [(42, 18, True), (22, 20, False), (34, 50, False)],
    },
    4: {
        "seam": [(8, 18), (26, 26), (30, 44), (48, 52)],
        "pockets": [(46, 20, 5)],
        "sparks": [(20, 40, True), (40, 34, False), (14, 14, False)],
    },
}


def decorate(brush, variant, rich):
    layout = LAYOUT[variant]
    if layout["seam"] is not None:
        seam(brush, layout["seam"], 2, rich, seed=variant * 1.9)
    for i, (cx, cy, r) in enumerate(layout["pockets"]):
        # A working deposit has had its easiest pockets taken already, so `Ore` is the
        # enriched face minus a third of its crystal: visibly the same seam, thinner.
        emptied = rich == 0 or (rich == 1 and i % 3 == 2)
        seed = variant * 31 + i * 7
        if emptied:
            hollow(brush, cx, cy, r, seed)
        else:
            # A full pocket is fuller: same socket, one pixel more crystal in it.
            crystal(brush, cx, cy, r + (1 if rich == 2 else 0), seed, rich)
    # Shine is Enriched's alone. Giving a worked bed even small sparkles was most of why
    # the two read the same from a distance.
    if rich == 2:
        for cx, cy, big in layout["sparks"]:
            sparkle(brush, cx, cy, big)


# --- assembly ------------------------------------------------------------------

# (file, richness, how far the rock has come apart, whether the fine mottling scale is on)
#
# Enriched drops the fine scale so its surface is CALMER than the other two — still
# textured, since a flat fill falls out of the tileset's look, but quiet enough that the
# fractures arriving on Ore read as the surface changing rather than as lines added to
# the same rock. The worked and spent beds keep the full two-scale mottling.
SHEETS = [
    ("enriched-ore-deposit.png", 2, 0.0, False),
    ("ore-deposit.png", 1, 0.42, True),
    # not quite 1.0: leaving a few fractures shut keeps some larger stones, so a
    # spent bed still has value structure instead of washing out to even rubble
    ("depleted-ore-deposit.png", 0, 0.82, True),
]


def build_sheet(grass, rich, breakup, fine):
    sheet = Image.new("RGBA", (CELL * STATES, CELL * VARIANTS), (0, 0, 0, 0))
    for variant in range(VARIANTS):
        for state in range(STATES):
            depth_fn = depth_for_state(BORDER, state)
            cell = grass.copy()
            render_bands(cell.load(), grass.load(), depth_fn, variant, breakup, fine)
            decorate(Brush(cell, depth_fn), variant, rich)
            sheet.paste(cell, (state * CELL, variant * CELL))
    return sheet


def main():
    plains = Image.open(SRC_PLAINS).convert("RGBA")
    grass = plains.crop((0, 0, CELL, CELL))
    for name, rich, breakup, fine in SHEETS:
        out = f"{BASE}/{name}"
        build_sheet(grass, rich, breakup, fine).save(out)
        print("wrote", out)


if __name__ == "__main__":
    os.makedirs(BASE, exist_ok=True)
    main()
