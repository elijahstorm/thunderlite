#!/usr/bin/env python3
"""Wasteland terrain tile — poisoned ground that shelters a unit well but costs it
health to sit on (see src/lib/GameData/terrain.ts).

The damage is the POINT of this terrain, and what has to read at a glance is why
standing here hurts. So it is drawn as an acid marsh, not as dead rock: sour standing
water pooled in churned toxic sludge, with the trees that grew here bleached and dead
in it. That also keeps it clearly apart from the ore beds, which are the other
grey-brown patch a player sees a lot of — those are dry stone with metal in them, this
is wet, sour and rotting.

A connector-5 (family-border) sheet: the same border-base + inner-corner autotile the
Charred Forest uses (spriteConnector). Wasteland declares no family, so it borders
against its own type — a spill of it autotiles into one contiguous bog instead of
every tile ringing itself, and concave junctions between its arms fill cleanly.

  columns (20)  border/corner states
    0-15  : border base states, indexed by spriteConnector.borderDecision — which
            cardinal neighbours are also Wasteland. Sludge runs clean to a connected
            edge; an open edge dries out through a blighted ring into clean grass.
    16-19 : inner-corner overlays (TL / BL / BR / TR), the quadrant pocket the
            renderer copies where a diagonal neighbour is clean ground.
  rows (VARIANTS) one interchangeable version of the whole 20-state set, picked per
            tile by spriteConnector.variantDecision. Static sheets (frames = 1), so a
            variant is exactly one row.

DRAWN IN THE TILESET'S LANGUAGE, the same way the ore beds are (see gen_terrain_ore.py
for the reasoning and terrain_texture for the machinery):

  * The ground is massed into a few large areas by a smooth swell sampled once per
    Voronoi cell, then MOTTLED so no area is ever flat. Mud gets its own five-step
    ramp, and its cells are coarser than the rock's — sludge clumps where stone plates.
  * MATERIAL GETS FORM SHADING, PROPS GET OUTLINES. The mud takes a step-shadow where
    a raised bank drops away; the pools and the dead trees standing in them carry a
    full ink silhouette.
  * The outer boundary into grass is an ordered dither, not per-pixel jitter.

Seamlessness: the outline and its margins are shared by every variant
(terrain_border), the mottling is shared outright, and the mass field reseeds only its
interior. Pools, snags and debris are a pure function of (variant, x, y) clipped to the
bog, so a base frame and a corner overlay from the same row always agree.

Grass is cropped from plains.png so the border meets neighbouring plains exactly.
"""
import math
import os

from terrain_border import Border, depth_for_state
from terrain_texture import (
    CELL,
    bayer,
    cell_field,
    hash01,
    massing,
    mottle,
    ramp_at,
)
from PIL import Image

BASE = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/terrain"
SRC_PLAINS = f"{BASE}/plains.png"
OUT = f"{BASE}/wasteland.png"

VARIANTS = 5  # rows: interchangeable versions of the whole 20-state set
STATES = 20   # columns: 16 border-base + 4 inner-corner

# --- palette: five mud steps plus an ink, four for the acid, two for the blight ---
INK = (30, 32, 24)
# A narrow ramp on purpose. Widening it turned the mottling into camouflage: sludge is
# one wet material, so its steps should read as damp and dry patches of the same mud,
# not as separate substances.
MUD_DEEP = (48, 52, 38)
MUD_DARK = (68, 72, 52)
MUD_MID = (92, 94, 68)
MUD_LIGHT = (116, 116, 86)
MUD_PALE = (140, 138, 106)
ACID_DEEP = (52, 96, 26)
ACID_MID = (110, 166, 44)
ACID_LIGHT = (168, 214, 68)
ACID_GLOW = (232, 248, 168)
BLIGHT_LO = (132, 140, 74)
BLIGHT_HI = (166, 178, 88)

RAMP = (MUD_DEEP, MUD_DARK, MUD_MID, MUD_LIGHT, MUD_PALE)
LEVEL_STEP = {0: 1, 1: 2, 2: 3}

# A bog slumps and spreads, so its corners want a real arc rather than the gentle
# chamfer the ore outcrop takes. Radius is close to the coastline's (gen_terrain_shore
# runs 20) because at half of it the patch still read as a rounded square rather than
# an oval — a bog has no reason to hold an angle. `amp` is up too: with a shallow
# wobble the long straight runs between corners were as square as the corners were.
BORDER = Border(base=6.5, amp=4.5, phases=(2.7, 5.4, 0.9, 3.6), arc=21.0)

MUD_D = 1.8        # depth at which the blighted grass gives way to sludge
BLIGHT_D = -2.2    # depth at which the blight gives way to clean grass
MUD_FADE = 2.5     # width of the ordered-dither ramp at the sludge edge
BLIGHT_FADE = 2.2  # width of the ordered-dither ramp at the grass edge
DECO_D = MUD_D + 2.0  # props only land this deep or deeper

MASS_GRID = 6
MASS_RING = 2
_mass_value = massing(
    harmonics=((0.28, 1, 1, 0.6), (0.15, 1, 2, 2.4)),
    thresholds=(0.42, 0.68),
)
_mass_cache = {}


def masses(variant):
    if variant not in _mass_cache:
        _mass_cache[variant] = cell_field(
            MASS_GRID, MASS_RING, variant, 51, _mass_value(variant)
        )
    return _mass_cache[variant]


def mud_pixel(x, y, variant):
    """Mottled sludge, with a step-shadow where a raised bank drops away to the lower
    right under the tileset's single top-left key light. Only the raised level casts, so
    the bog reads as a few soft banks rather than as a network of outlines."""
    lvl = masses(variant)
    level = lvl[y][x]
    if level < 2:
        for dx, dy in ((-1, 0), (0, -1), (-1, -1)):
            if lvl[(y + dy) % CELL][(x + dx) % CELL] == 2:
                return MUD_DARK if level == 1 else INK
    return ramp_at(RAMP, LEVEL_STEP[level] + mottle(x, y))


def blighted(x, y, grass_px):
    """Grass the seepage has reached but not killed. Two flat tones over the plains mat,
    picked by ordered dither, so the ring reads as a drawn edge."""
    base = BLIGHT_HI if bayer(x + 1, y + 3) > 0.42 else BLIGHT_LO
    if mottle(x, y) < 0:
        base = BLIGHT_LO
    # Only part way to the target, so the plains mat's own blades still read through.
    # Taken all the way, the dither pattern itself became the texture and the ring
    # turned into a visible checkerboard.
    r, g, b, _ = grass_px
    t = 0.62
    return (
        int(r + (base[0] - r) * t),
        int(g + (base[1] - g) * t),
        int(b + (base[2] - b) * t),
        255,
    )


def render_bands(px, gp, depth_fn, variant):
    """Paint one cell: sludge, a blighted grass ring, then clean grass. Both boundaries
    are ordered dithers, so the bog stipples into the turf rather than being outlined
    against it."""
    for y in range(CELL):
        for x in range(CELL):
            d = depth_fn(x, y)
            b = bayer(x, y)
            if (d - MUD_D) / MUD_FADE > b:
                px[x, y] = (*mud_pixel(x, y, variant), 255)
            elif (d - BLIGHT_D) / BLIGHT_FADE > b:
                px[x, y] = blighted(x, y, gp[x, y])
            else:
                px[x, y] = gp[x, y]


# --- props ---------------------------------------------------------------------

class Brush:
    def __init__(self, img, depth_fn):
        self.px = img.load()
        self.depth = depth_fn

    def allows(self, x, y):
        return 0 <= x < CELL and 0 <= y < CELL and self.depth(x, y) >= DECO_D

    def at(self, x, y):
        return self.px[x, y][:3] if 0 <= x < CELL and 0 <= y < CELL else None

    def put(self, x, y, c):
        if self.allows(x, y):
            self.px[x, y] = (c[0], c[1], c[2], 255)


ACID_TONES = (ACID_DEEP, ACID_MID, ACID_LIGHT, ACID_GLOW)


def pool(brush, cx, cy, rx, ry, seed):
    """Draw a pool, closing its outline wherever the bog's edge cuts it.

    A pool near the patch boundary has to be cut — it cannot spill onto grass. The
    complaint was never the cut, it was that the cut had no edge: the pool's own ink
    ring lives on its outside, so once the boundary sliced through the body you saw
    bare acid stopping mid-stroke, which reads as the sprite running out at the tile
    line. So after clipping, any acid pixel that lost a neighbour to the clip becomes
    ink, and the pond closes itself against the mud however much of it survived.

    Shrinking the pool to fit instead was the first attempt, and it was worse: the
    region every state agrees on is small enough that most pools vanished.
    """
    shape = {(x, y): col for x, y, col in _pool_pixels(cx, cy, rx, ry, seed)}
    kept = {xy: col for xy, col in shape.items() if brush.allows(*xy)}
    for x, y, col in _pool_shine_pixels(cx, cy, rx, ry, seed):
        if kept.get((x, y)) in ACID_TONES:
            kept[(x, y)] = col
    # Close the outline: acid may only ever touch acid or ink. That one rule covers
    # both ways an edge opens up — the bog clipping through the body, and the ink ring
    # itself coming out thinner than a pixel where the pool's outline runs shallow.
    edge = [
        xy
        for xy, col in kept.items()
        if col in ACID_TONES
        and any(
            kept.get((xy[0] + dx, xy[1] + dy)) not in ACID_TONES
            and kept.get((xy[0] + dx, xy[1] + dy)) != INK
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1))
        )
    ]
    for xy in edge:
        kept[xy] = INK
    for (x, y), col in kept.items():
        brush.put(x, y, col)


def _pool_pixels(cx, cy, rx, ry, seed):
    """A pool of standing acid — the thing that makes this terrain hurt.

    Built as a prop, so it takes a full ink silhouette, and then flat bands inside it
    rather than a gradient: a bright shallow rim, a mid body, a dark middle where it is
    deep. The ink line is what stops it reading as a sticker.

    Returns its pixels rather than painting them, so the caller can check the whole
    shape fits before committing to it.
    """
    out = []

    def inside(x, y, grow=0.0):
        nx, ny = (x - cx) / (rx + grow), (y - cy) / (ry + grow)
        ang = math.atan2(ny, nx)
        wob = 0.20 * math.sin(ang * 3 + seed) + 0.12 * math.sin(ang * 5 - seed * 1.7)
        return nx * nx + ny * ny <= (1.0 + wob) ** 2

    for y in range(int(cy - ry - 5), int(cy + ry + 6)):
        for x in range(int(cx - rx - 5), int(cx + rx + 6)):
            if not inside(x, y, 2.4):
                continue
            if not inside(x, y, 1.2):
                # ground the acid has burned dry around itself
                out.append((x, y, MUD_PALE if bayer(x, y) > 0.5 else MUD_LIGHT))
            elif not inside(x, y, 0.2):
                out.append((x, y, INK))
            else:
                nx, ny = (x - cx) / rx, (y - cy) / ry
                depth = nx * nx + ny * ny
                out.append(
                    (
                        x,
                        y,
                        ACID_LIGHT if depth > 0.62 else ACID_MID if depth > 0.24 else ACID_DEEP,
                    )
                )
    return out


def _pool_shine_pixels(cx, cy, rx, ry, seed):
    """One flat specular streak across the upper half — what sells the pool as a
    surface rather than a hole. Returned rather than painted so it lands before the
    outline pass, and so a streak on a clipped edge inks over like everything else."""
    out = []
    def inside(x, y, grow=0.0):
        nx, ny = (x - cx) / (rx + grow), (y - cy) / (ry + grow)
        ang = math.atan2(ny, nx)
        wob = 0.20 * math.sin(ang * 3 + seed) + 0.12 * math.sin(ang * 5 - seed * 1.7)
        return nx * nx + ny * ny <= (1.0 + wob) ** 2

    sx, sy = int(cx - rx * 0.45), int(cy - ry * 0.42)
    for i in range(max(2, int(rx * 0.8))):
        if inside(sx + i, sy, -1.4):
            out.append((sx + i, sy, ACID_GLOW))
    for i in range(max(1, int(rx * 0.35))):
        if inside(sx + 2 + i, sy + 2, -1.4):
            out.append((sx + 2 + i, sy + 2, ACID_LIGHT))
    return out


def _rim(brush, x, y, lit):
    """The trunk's lit or shaded edge, in whatever it is standing in.

    A snag often stands in a pool, and a mud-coloured rim laid over acid both looked
    wrong and broke the pool's outline (acid is only ever allowed to touch acid or
    ink). Sampling the pixel underneath means a tree in the water gets a wet acid rim
    instead, and the pond stays properly closed.
    """
    under = brush.at(x, y)
    if under == INK:
        # never paint over an outline that is already there: overwriting the pool's own
        # ink ring with a mud rim was what re-opened the pond's edge
        return INK
    if under in ACID_TONES:
        return ACID_LIGHT if lit else ACID_DEEP
    return MUD_PALE if lit else MUD_DARK


def snag(brush, cx, cy, seed):
    """A tree the ground killed and left standing — bleached, bare and forked. Full ink
    silhouette with a pale lit edge, drawn the way the Forest tile draws a trunk."""
    h = 16 + int(hash01(seed, 1) * 5)
    lean = -1 if hash01(seed, 5) > 0.55 else 1

    def offset(i):
        return int(lean * i * i / (h * 3.0))

    for dx in range(-4, 5):
        brush.put(cx + dx, cy + 1, INK if abs(dx) < 3 else _rim(brush, cx + dx, cy + 1, False))
        brush.put(cx + dx + 2, cy + 2, _rim(brush, cx + dx + 2, cy + 2, False))
    for i in range(h):
        x, y = cx + offset(i), cy - i
        w = 4 if i < h * 0.35 else 3 if i < h * 0.7 else 2
        brush.put(x - 1, y, _rim(brush, x - 1, y, True))
        for k in range(w):
            brush.put(x + k, y, INK)
        brush.put(x + w, y, _rim(brush, x + w, y, False))
    brush.put(cx + offset(h), cy - h, _rim(brush, cx + offset(h), cy - h, False))

    for start, run, dirx in ((0.32, 8, -lean), (0.55, 7, lean), (0.78, 5, -lean)):
        by, bx = cy - int(h * start), cx + offset(int(h * start))
        for i in range(1, run + 1):
            x, y = bx + dirx * i, by - int(i * 1.1)
            brush.put(x, y, INK)
            brush.put(x, y - 1, INK if i <= run - 2 else _rim(brush, x, y - 1, False))
            brush.put(x, y + 1, _rim(brush, x, y + 1, True))
        tx, ty = bx + dirx * (run + 1), by - int((run + 1) * 1.1)
        brush.put(tx, ty, _rim(brush, tx, ty, False))


def debris(brush, cx, cy, spread, count, seed):
    """Whatever the bog has killed and half-swallowed: chunky inked grit, not speckle."""
    for i in range(count):
        x = cx + int((hash01(i, seed, 1) - 0.5) * spread * 2)
        y = cy + int((hash01(i, seed, 2) - 0.5) * spread * 2)
        run = 1 + int(hash01(i, seed, 3) * 2.4)
        for k in range(run):
            brush.put(x + k, y, INK)
        brush.put(x, y - 1, _rim(brush, x, y - 1, True))
        brush.put(x, y + 1, _rim(brush, x, y + 1, False))


# Per-variant layout. The variants deliberately differ in how WET they are: a bog that
# is all pools everywhere reads as a texture, while drier tiles between the wet ones
# make the water look like water. Props stay inset from the tile edge so a connected
# seam never halves one.
LAYOUT = {
    0: {"pools": [(21, 38, 12, 9, 3)], "snags": [(43, 24, 11)], "debris": [(46, 50, 7, 5, 31)]},
    1: {  # the dry one
        "pools": [(44, 43, 6, 5, 7)],
        "snags": [(20, 30, 23), (40, 18, 29)],
        "debris": [(26, 48, 9, 7, 37), (14, 16, 7, 5, 41)],
    },
    2: {"pools": [(30, 30, 15, 12, 13)], "snags": [(46, 47, 17)], "debris": [(13, 49, 6, 4, 43)]},
    3: {
        "pools": [(19, 22, 9, 7, 19), (42, 45, 10, 8, 23)],
        "snags": [(45, 20, 27)],
        "debris": [(16, 47, 7, 5, 53)],
    },
    4: {
        "pools": [(34, 40, 11, 8, 29)],
        "snags": [(18, 24, 31)],
        "debris": [(48, 18, 8, 6, 59), (26, 54, 6, 4, 61)],
    },
}


def decorate(brush, variant):
    layout = LAYOUT[variant]
    for cx, cy, spread, count, seed in layout["debris"]:
        debris(brush, cx, cy, spread, count, seed)
    for cx, cy, rx, ry, seed in layout["pools"]:
        pool(brush, cx, cy, rx, ry, seed)
    for cx, cy, seed in layout["snags"]:
        snag(brush, cx, cy, seed)


def main():
    plains = Image.open(SRC_PLAINS).convert("RGBA")
    grass = plains.crop((0, 0, CELL, CELL))
    sheet = Image.new("RGBA", (CELL * STATES, CELL * VARIANTS), (0, 0, 0, 0))
    for variant in range(VARIANTS):
        for state in range(STATES):
            depth_fn = depth_for_state(BORDER, state)
            cell = grass.copy()
            render_bands(cell.load(), grass.load(), depth_fn, variant)
            decorate(Brush(cell, depth_fn), variant)
            sheet.paste(cell, (state * CELL, variant * CELL))
    sheet.save(OUT)
    print("wrote", OUT, sheet.size)


if __name__ == "__main__":
    os.makedirs(BASE, exist_ok=True)
    main()
