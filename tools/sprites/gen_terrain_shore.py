#!/usr/bin/env python3
"""Shore terrain tile — a sandy beach that reads as ONE coastline along a run.

The hand-authored sheet this replaces drew every border state as a slice of the
same round lagoon: a sand arch pinched between rocky headlands baked into the
tile's left and right edges. Autotiling picked the right frames, but because each
frame closed itself off at its own borders, a run of eight beach tiles rendered as
eight identical coves separated by rock pillars instead of one long beach. Every
shape in the editor showed it — strips pinched at each seam, blocks notched at
every tile join; only the isolated single tile (state 11, a closed lagoon) looked
right, because a closed lagoon is the only thing the old art actually drew.

So the geometry here is generated from a signed distance field instead of drawn
per tile. Every edge's coastline is a margin curve that is CELL-periodic in the
coordinate running along that edge, so neighbouring tiles evaluate the *same*
curve at the shared border and the sand, surf and shallows cross the seam with no
step. That is the whole fix: continuity is a property of the field, not something
each frame has to remember to draw.

  cols 0-15  : border base states, indexed by spriteConnector.borderDecision —
               which cardinal neighbours are also water. Land-facing edges grow a
               beach; water-facing edges run clean off the tile.
  cols 16-19 : inner-corner overlays (TL / BL / BR / TR). The renderer copies just
               the matching quadrant over the base, so a diagonal spit of land
               rounds into the water instead of leaving a square notch.
  cols 20-27 : beach END CAPS (TL / TR / BL / BR, twice — once for a beach running
               along a horizontal land edge, once for a vertical one). Drawn as
               quadrant overlays like the inner corners. A cap is what the beach
               does when it runs out: where the sand would otherwise cross into
               open Sea, it climbs into a rock headland that meets the Sea tile's
               own cliff. The caps are the reason Shore has to read its neighbours
               as shore-vs-deep-water and not merely as water, which the `ocean`
               reader alone cannot tell — see spriteConnector.capDecision.

  rows       : variant * FRAMES + frame. FRAMES rows of surf animation per variant,
               VARIANTS variants stacked below each other (see paint.renderObject).
               A variant re-shapes the coastline with a bump that is pinned to zero
               (value AND slope) at every tile border, so ANY variant tiles cleanly
               against any other — the variation lives strictly in the interior —
               and scatters rocks, tide pools, driftwood and dune grass across the
               sand. spriteConnector.variantDecision picks one per tile from a
               position hash, so a long beach stops repeating one motif.

Palette is sampled from the original sheet so the new beach sits in the same world
as the rest of the terrain, and open water is lifted straight out of sea.png
frame-for-frame so a Shore tile is seamless against a Sea one.
"""
import math
import os

from PIL import Image

BASE = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/terrain"
SRC_PLAINS = f"{BASE}/plains.png"
SRC_SEA = f"{BASE}/sea.png"
OUT = f"{BASE}/shore.png"

CELL = 60
FRAMES = 3
VARIANTS = 8
COLS = 28  # 16 border base + 4 inner corner + 8 beach cap

# --- palette (sampled from the original shore.png / sea.png) ---
GRASS_RIM = (95, 147, 104)
SHORE_INK = (64, 104, 69)
DUNE_LO = (160, 155, 102)
DUNE = (182, 173, 111)
SAND_MID = (207, 203, 138)
SAND = (223, 217, 138)
SAND_HI = (238, 242, 173)
FOAM = (222, 248, 226)
SURF = (161, 225, 163)
SHALLOW = (65, 207, 190)
SHELF = (27, 167, 196)
ROCK = (51, 46, 42)
ROCK_MID = (86, 82, 73)
ROCK_WARM = (117, 99, 78)
ROCK_HI = (156, 138, 78)
DEEP_SHADOW = (100, 87, 156)
WOOD = (117, 99, 78)
WOOD_HI = (156, 138, 78)
TUFT = (64, 104, 69)
TUFT_HI = (111, 154, 82)

# --- band edges, in px of depth into the water from the coastline ---
# Read as a beach profile: dry dune at the grass line, a bright dry crown, sand
# darkening as it wets, then the foam line and a shelf of shallows falling away
# into the Sea's own open water.
D_DUNE = 3.0
D_SAND = 12.0
D_WET = 14.4
D_FOAM = 16.2
D_SURF = 18.2
D_SHALLOW = 20.6
D_SHELF = 23.5

# How far the coastline sits inside a land-facing edge, and how much it meanders.
# CELL-periodic in the along-edge coordinate, so both tiles sharing a border read
# the same value there. The meander is deliberately LONG and deep (see `wave`): with
# a shallow, short-period wobble every straight run of beach read as a ruled line
# offset from the tile edge, which is half of what made a coastline look boxy.
BASE_MARGIN = 5.0
MARGIN_AMP = 4.0
MIN_MARGIN = 0.8

# Radius of the arc that carries the coastline around a corner where two land edges
# meet (see `round_min`). This is the other half of the boxiness fix: the band is a
# quarter of a tile wide, so a corner turned in a couple of pixels reads as a right
# angle no matter how the straights behave. At this radius the coast sweeps through a
# genuine quarter circle instead.
#
# Seam-safe by construction, not by tuning: the arc is only active where BOTH edges'
# coastlines are within the radius, and at any border shared with another shore tile
# the other edge's coastline is ~53px away. Everything below that is a plain minimum,
# so neighbours still agree exactly. It also leaves a lone tile's lagoon alone, which
# a smooth-minimum could not: four near-equal depths at the tile centre are all far
# outside the radius, so the centre keeps its full depth instead of being pulled up
# into sand.
CORNER_ROUND = 20.0

# A cap's rock headland: how deep the rock runs at the tile border it caps, and how
# far the purple underwater shadow trails past it. Both match sea.png's cliff so the
# two tiles meet as one rock face.
ROCK_DEPTH = 15.0
ROCK_SHADOW = 3.0

# Sheet column -> (left, up, right, down) neighbour-is-water, inverted from
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

# The two tile edges bounding each inner-corner overlay's land pocket
# (paint.cornerQuadrant): 16 top-left, 17 bottom-left, 18 bottom-right, 19 top-right.
CORNER_EDGES = {
    16: ("left", "top"),
    17: ("left", "bottom"),
    18: ("right", "bottom"),
    19: ("right", "top"),
}

# Beach end caps: (land edge the beach hugs, tile border it runs out through).
# The quadrant each occupies is implied by the pair and must match
# paint.cornerQuadrant. Kept in lockstep with spriteConnector.CAP_STATE.
CAP_EDGES = {
    20: ("top", "left"),
    21: ("top", "right"),
    22: ("bottom", "left"),
    23: ("bottom", "right"),
    24: ("left", "top"),
    25: ("left", "bottom"),
    26: ("right", "top"),
    27: ("right", "bottom"),
}


def hash01(x, y, salt=0):
    n = (x * 374761393 + y * 668265263 + salt * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def smoothstep(t):
    t = clamp(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def wave(coord, phase):
    """Meander of the coastline, periodic over one CELL so it is continuous where
    two tiles meet.

    First and second harmonic only. Higher harmonics fit more wiggle into a tile but
    each one is a short-period ripple, and a ripple on a band this wide reads as a
    ragged edge rather than as a curving shore. One long swell per tile, with a half
    swell under it, is what actually looks like a coastline.
    """
    a = 0.5 + 0.5 * math.sin(2 * math.pi * coord / CELL + phase)
    b = 0.5 + 0.5 * math.sin(2 * math.pi * 2 * coord / CELL + phase * 1.7 + 1.1)
    return 0.62 * a + 0.38 * b


def bump(coord, variant, salt):
    """Per-variant reshaping of the coastline, windowed by sin^2 so its value AND
    its slope vanish at both tile borders. That is what lets any variant sit next
    to any other: at the seam every variant collapses onto the shared `wave`
    curve, and all the variation stays in the tile's interior."""
    if variant == 0:
        return 0.0
    k = 1 + (variant + salt) % 2  # first two harmonics only, as `wave` above
    phase = ((variant * 2.399) + (salt * 1.117)) % (2 * math.pi)
    window = math.sin(math.pi * coord / CELL) ** 2
    return 3.4 * window * math.sin(2 * math.pi * k * coord / CELL + phase)


def margin(edge, coord, variant):
    phase, salt = {
        "top": (0.3, 0),
        "bottom": (2.4, 1),
        "left": (4.1, 2),
        "right": (5.7, 3),
    }[edge]
    m = BASE_MARGIN + MARGIN_AMP * wave(coord, phase) + bump(coord, variant, salt)
    return max(MIN_MARGIN, m)


def edge_depth_one(edge, x, y, variant):
    """Signed px into the water from one land-facing edge's coastline."""
    if edge == "left":
        return x - margin("left", y, variant)
    if edge == "right":
        return (CELL - 1 - x) - margin("right", y, variant)
    if edge == "top":
        return y - margin("top", x, variant)
    return (CELL - 1 - y) - margin("bottom", x, variant)


def round_min(a, b, r=CORNER_ROUND):
    """Intersection of two stretches of water with the corner between them swept
    into a quarter-circle arc of radius `r`.

    `a` and `b` are depths into the water from two coastlines, so plain `min(a, b)`
    is the water they have in common and leaves a right angle where they cross. Here
    the corner is instead the exact distance to a quarter-plane whose tip is rounded:
    the boundary follows a circle of radius `r` centred `r` in from both coastlines,
    which is a real arc rather than a chamfer.

    The two branches meet exactly (at `a == r` the arc term collapses to `b`), and
    outside the corner quadrant this IS `min` — which is what makes it safe where a
    smooth minimum is not. A smooth minimum perturbs the result whenever the two
    depths are merely CLOSE, so on a lone tile, whose four coastlines are all equally
    far from the centre, it would drag the middle of the lagoon up into sand. This
    only ever fires within `r` of a corner.
    """
    if a < r and b < r:
        return r - math.hypot(r - a, r - b)
    return a if a < b else b


def base_depth(x, y, L, U, R, D, variant):
    """Border-base tile: every land-facing edge pushes its coastline in, and the
    water is whatever survives all of them, with the corners between them arced. A
    connected (water) edge imposes no limit, so the field runs straight off that side
    of the tile."""
    best = None
    for edge, water in (("left", L), ("right", R), ("top", U), ("bottom", D)):
        if water:
            continue
        d = edge_depth_one(edge, x, y, variant)
        best = d if best is None else round_min(best, d)
    return 999.0 if best is None else best


def corner_depth(x, y, edge_a, edge_b, variant):
    """Inner (concave) corner overlay: land only where BOTH bounding edges call it
    land, which tucks a pocket into the corner. This is the exact distance to that
    pocket rather than a plain max of the two, so the bands curve around its point
    instead of turning a square right angle — and because the two agree whenever
    either edge reads land, the pocket's coastline still meets the neighbouring
    tiles' coastlines exactly at the borders."""
    a = edge_depth_one(edge_a, x, y, variant)
    b = edge_depth_one(edge_b, x, y, variant)
    outside = math.hypot(max(a, 0.0), max(b, 0.0))
    return outside + min(max(a, b), 0.0)


# --- texture ---------------------------------------------------------------


def sand_tone(x, y, d, variant):
    """Beach cross-section: damp dark sand at the grass line, a bright dry crown
    through the middle, then sand darkening again as it wets toward the surf.

    The tide ripples are a function of DEPTH alone, so they run parallel to the
    coast wherever it goes and cross tile borders for free — the depth field is
    already continuous there, so the texture inherits the continuity instead of
    having to be stitched."""
    g = hash01(x, y, 40 + variant)
    if d < D_DUNE:
        return DUNE_LO if g > 0.62 else DUNE
    if d >= D_WET:
        return DUNE_LO if g > 0.45 else DUNE
    t = (d - D_DUNE) / (D_WET - D_DUNE)
    crown = math.sin(math.pi * clamp(t * 1.05, 0.0, 1.0))
    ripple = math.sin(d * 1.9 + variant * 1.3) * 0.16
    level = 0.7 * crown + 0.22 * g - ripple
    if level > 0.78:
        return SAND_HI
    if level > 0.46:
        return SAND
    if level > 0.2:
        return SAND_MID
    return DUNE


def water_tone(x, y, d, frame, variant, deep):
    """Foam line, then the shelf of shallows falling away into open water. The foam
    breathes with the frame; speckle is hashed per variant so six tiles side by side
    do not share one pattern."""
    swell = 0.7 * math.sin(2 * math.pi * frame / FRAMES)
    if d < D_FOAM + swell:
        g = hash01(x, y, 60 + variant * 7 + frame)
        return FOAM if g > 0.42 else SURF
    if d < D_SURF + swell * 0.7:
        g = hash01(x, y, 72 + variant * 7 + frame)
        return SURF if g > 0.2 else FOAM
    if d < D_SHALLOW:
        g = hash01(x, y, 80 + variant * 5)
        return SHALLOW if g > 0.16 else SURF
    if d < D_SHELF:
        g = hash01(x, y, 95 + variant * 3)
        return SHELF if g > 0.12 else SHALLOW
    # Feather the last couple of px into the Sea's own water so the shelf does not
    # end on a drawn line.
    if d < D_SHELF + 2.5 and hash01(x, y, 101 + variant) > 0.55:
        return SHELF
    return deep


def rock_tone(x, y, d, variant):
    g = hash01(x, y, 120 + variant)
    lit = d < 3.5
    if g > 0.93:
        return ROCK_HI if lit else ROCK_WARM
    if g > 0.7:
        return ROCK_MID
    return ROCK


def render_bands(px, grass_px, deep_px, depth_fn, frame, variant):
    """Paint one cell from the signed depth field: grass, a shaded rim and a damp
    ink line at the coast, the beach, then surf into open water. A little hashed
    jitter on the depth keeps the band edges from reading as drawn lines."""
    for y in range(CELL):
        for x in range(CELL):
            d = depth_fn(x, y) + (hash01(x, y, 11 + variant) - 0.5) * 1.5
            if d < -2.2:
                px[x, y] = grass_px[x, y]
            elif d < -0.9:
                px[x, y] = (*mix(grass_px[x, y][:3], GRASS_RIM, 0.8), 255)
            elif d < 0.0:
                px[x, y] = (*SHORE_INK, 255)
            elif d < D_WET:
                px[x, y] = (*sand_tone(x, y, d, variant), 255)
            else:
                px[x, y] = (*water_tone(x, y, d, frame, variant, deep_px[x, y][:3]), 255)


# --- decorations -----------------------------------------------------------
# Everything here is confined to the tile interior (see DECO_LO/DECO_HI): a
# decoration clipped by a tile border would read as half a rock, and unlike the
# bands it cannot be made to continue into the neighbour.

DECO_LO = 15
DECO_HI = 45


def put(px, x, y, c):
    if 0 <= x < CELL and 0 <= y < CELL:
        px[x, y] = (*c, 255)


def get(px, x, y):
    if 0 <= x < CELL and 0 <= y < CELL:
        return px[x, y][:3]
    return None


def edge_point(edge, coord, depth, variant):
    """The point `depth` px into the water from `edge`'s coastline at `coord`."""
    m = margin(edge, coord, variant)
    if edge == "top":
        return coord, m + depth
    if edge == "bottom":
        return coord, CELL - 1 - m - depth
    if edge == "left":
        return m + depth, coord
    return CELL - 1 - m - depth, coord


def boulder(px, cx, cy, seed):
    """A rock shouldering out of the sand: two or three overlapping lobes, lit from
    the top-left like the cliff faces in sea.png, with a shadow pooled on its lower
    side so it sits ON the beach rather than floating over it."""
    lobes = 2 + int(hash01(seed, 1) * 2)
    cells = {}
    for i in range(lobes):
        ox = int((hash01(seed, 2 + i) - 0.5) * 5)
        oy = int((hash01(seed, 6 + i) - 0.5) * 3)
        rx = 2 + int(hash01(seed, 10 + i) * 2)
        ry = 2 + int(hash01(seed, 14 + i) * 2)
        for dy in range(-ry, ry + 1):
            for dx in range(-rx, rx + 1):
                if (dx / (rx + 0.45)) ** 2 + (dy / (ry + 0.45)) ** 2 > 1.0:
                    continue
                cells[(cx + ox + dx, cy + oy + dy)] = (dx / (rx + 0.45), dy / (ry + 0.45))
    if not cells:
        return
    low = max(y for _, y in cells)
    for (x, y), (nx, ny) in cells.items():
        g = hash01(x, y, seed + 21)
        lit = nx + ny
        if lit < -0.6:
            col = ROCK_HI if g > 0.45 else ROCK_WARM
        elif lit < 0.15:
            col = ROCK_WARM if g > 0.6 else ROCK_MID
        elif lit < 0.8:
            col = ROCK_MID if g > 0.5 else ROCK
        else:
            col = ROCK
        put(px, x, y, col)
    # Contact shadow on the sand under the rock's lower edge.
    for (x, y) in list(cells):
        if (x, y + 1) in cells:
            continue
        under = get(px, x, y + 1)
        if under and under not in (ROCK, ROCK_MID, ROCK_WARM, ROCK_HI):
            put(px, x, y + 1, mix(under, ROCK, 0.42))
    del low


def tide_pool(px, cx, cy, seed):
    """A puddle left behind in the sand — the beach's only cool tone, so it breaks
    up a long stretch of flat yellow without adding another silhouette."""
    rx = 4 + int(hash01(seed, 3) * 3)
    ry = 3 + int(hash01(seed, 4) * 2)
    for dy in range(-ry - 2, ry + 3):
        for dx in range(-rx - 2, rx + 3):
            wob = 0.14 * math.sin(math.atan2(dy + 0.01, dx + 0.01) * 3 + seed)
            n = (dx / (rx + 0.5)) ** 2 + (dy / (ry + 0.5)) ** 2 + wob
            if n > 1.45:
                continue
            if n > 1.05:
                put(px, cx + dx, cy + dy, mix(DUNE_LO, SAND_MID, 0.4))
            elif n > 0.78:
                put(px, cx + dx, cy + dy, mix(DUNE_LO, SURF, 0.55))
            elif n > 0.4:
                put(px, cx + dx, cy + dy, mix(SURF, SHALLOW, 0.45))
            else:
                put(px, cx + dx, cy + dy, mix(SHALLOW, SHELF, 0.35))


def driftwood(px, cx, cy, seed, vertical):
    length = 6 + int(hash01(seed, 6) * 5)
    for i in range(length):
        lean = 1 if i > length * 0.6 else 0
        dx, dy = (lean, i) if vertical else (i, lean)
        put(px, cx + dx, cy + dy, WOOD)
        put(px, cx + dx + (0 if vertical else 0), cy + dy + 1, mix(WOOD, ROCK, 0.5))
        if hash01(seed + i, 7) > 0.7:
            put(px, cx + dx, cy + dy, WOOD_HI)
    if hash01(seed, 8) > 0.45:
        bx, by = (cx + 2, cy + length // 2) if vertical else (cx + length // 2, cy - 2)
        put(px, bx, by, WOOD)
        put(px, bx + 1, by - (0 if vertical else 1), WOOD)


def dune_tuft(px, cx, cy, seed):
    """Marram grass on the dry sand, at the grass line where it belongs."""
    blades = 3 + int(hash01(seed, 9) * 3)
    for b in range(blades):
        bx = cx + b - blades // 2
        h = 3 + int(hash01(seed, 10 + b) * 3)
        lean = 1 if hash01(seed, 20 + b) > 0.6 else 0
        for i in range(h):
            put(px, bx + (lean if i > h // 2 else 0), cy - i, TUFT if i < h - 1 else TUFT_HI)


def submerged_rocks(px, edge, coord, variant, seed):
    """A few rocks out in the shallows. Reads as the shelf the Shore's `Shallow`
    modifier claims is there, and gives the water band something to look at."""
    for i in range(2 + int(hash01(seed, 40) * 3)):
        depth = D_SURF + hash01(seed, 41 + i) * (D_SHELF - D_SURF - 1.0)
        off = int((hash01(seed, 45 + i) - 0.5) * 14)
        x, y = edge_point(edge, clamp(coord + off, DECO_LO, DECO_HI), depth, variant)
        x, y = int(x), int(y)
        r = 2 + int(hash01(seed, 50 + i) * 2)
        for dy in range(-r - 1, r + 2):
            for dx in range(-r - 1, r + 2):
                n = dx * dx + dy * dy
                if n > (r + 1) * (r + 1):
                    continue
                g = hash01(x + dx, y + dy, seed + 55)
                if n > r * r:
                    put(px, x + dx, y + dy, mix(SHALLOW, FOAM, 0.55))
                elif dx + dy < -r * 0.5:
                    put(px, x + dx, y + dy, ROCK_WARM if g > 0.5 else ROCK_MID)
                else:
                    put(px, x + dx, y + dy, ROCK_MID if g > 0.7 else ROCK)


# Each variant is a stretch of coast with its own character. Giving most of them
# at most ONE small feature is deliberate: the bug being fixed here is a beach that
# reads as a repeating motif, and scattering clutter on every tile just swaps one
# rhythm for another. The variation that carries a long run is the coastline SHAPE
# (see `bump`) and the ripple phase; the features are punctuation.
VARIANT_KIND = [
    None,  # bare sand
    "boulder",
    None,
    "tide_pool",
    "driftwood",
    None,
    "rocks",
    "tuft",
]


def decorate(px, edges, variant):
    kind = VARIANT_KIND[variant % len(VARIANT_KIND)]
    if kind is None or not edges:
        return
    slot = int(hash01(variant, 21) * len(edges)) % len(edges)
    edge = edges[slot]
    vertical = edge in ("left", "right")
    coord = int(DECO_LO + hash01(variant * 7 + slot, 22) * (DECO_HI - DECO_LO))
    seed = variant * 101 + slot * 29
    if kind == "boulder":
        x, y = edge_point(edge, coord, 3.6 + hash01(seed, 24) * 2, variant)
        boulder(px, int(x), int(y), seed)
    elif kind == "tide_pool":
        x, y = edge_point(edge, coord, 7.0 + hash01(seed, 25) * 2, variant)
        tide_pool(px, int(x), int(y), seed)
    elif kind == "driftwood":
        x, y = edge_point(edge, coord, 5.0 + hash01(seed, 26) * 3, variant)
        driftwood(px, int(x), int(y), seed, vertical=not vertical)
    elif kind == "tuft":
        x, y = edge_point(edge, coord, 1.4, variant)
        dune_tuft(px, int(x), int(y), seed)
    else:
        submerged_rocks(px, edge, coord, variant, seed)


# --- cells -----------------------------------------------------------------


def build_base(grass, deep, idx, frame, variant):
    L, U, R, D = INDEX_TO_LURD[idx]
    cell = grass.copy()
    px = cell.load()
    render_bands(
        px,
        grass.load(),
        deep.load(),
        lambda x, y: base_depth(x, y, L, U, R, D, variant),
        frame,
        variant,
    )
    land_edges = [
        e for e, water in (("left", L), ("top", U), ("right", R), ("bottom", D)) if not water
    ]
    # A fully enclosed tile (state 11) is one small lagoon; clutter on all four of
    # its edges buries it, so it keeps a single piece.
    if len(land_edges) == 4:
        land_edges = land_edges[:1]
    decorate(px, land_edges, variant)
    return cell


def build_corner(grass, deep, idx, frame, variant):
    edge_a, edge_b = CORNER_EDGES[idx]
    cell = grass.copy()
    render_bands(
        cell.load(),
        grass.load(),
        deep.load(),
        lambda x, y: corner_depth(x, y, edge_a, edge_b, variant),
        frame,
        variant,
    )
    return cell


def build_cap(grass, deep, idx, frame, variant):
    """A beach end cap. The base tile has already laid a full beach along
    `land_edge`; this overlay re-paints one quadrant of it, raising a rock headland
    that is a full sea-cliff at the `exit` border and has faded to nothing by the
    middle of the tile. Drawn over the same coastline the base uses, so the grass
    line and whatever sand survives past the taper stay continuous with it."""
    land_edge, exit_edge = CAP_EDGES[idx]
    cell = grass.copy()
    px = cell.load()
    render_bands(
        px,
        grass.load(),
        deep.load(),
        lambda x, y: edge_depth_one(land_edge, x, y, variant),
        frame,
        variant,
    )
    deep_px = deep.load()
    along_of = {
        "left": lambda x, y: x,
        "right": lambda x, y: CELL - 1 - x,
        "top": lambda x, y: y,
        "bottom": lambda x, y: CELL - 1 - y,
    }[exit_edge]
    # The headland's own outline wavers along the coast rather than tapering on a
    # straight diagonal, which would read as a cut.
    across_of = {
        "left": lambda x, y: y,
        "right": lambda x, y: y,
        "top": lambda x, y: x,
        "bottom": lambda x, y: x,
    }[exit_edge]
    for y in range(CELL):
        for x in range(CELL):
            along = along_of(x, y)
            t = smoothstep(along / (CELL / 2))
            if t >= 1.0:
                continue
            d = edge_depth_one(land_edge, x, y, variant) + (
                hash01(x, y, 11 + variant) - 0.5
            ) * 1.5
            if d < 0:
                continue
            ragged = 1.6 * math.sin(across_of(x, y) * 0.55 + variant * 1.7) + 1.4 * math.sin(
                along * 0.9 + 0.6
            )
            rock_to = ROCK_DEPTH * (1.0 - t) + ragged * (1.0 - t)
            if d < rock_to:
                px[x, y] = (*rock_tone(x, y, d, variant), 255)
            elif d < rock_to + ROCK_SHADOW * (1.0 - t):
                px[x, y] = (*DEEP_SHADOW, 255)
            elif d >= D_SHELF - 6.0 * (1.0 - t):
                px[x, y] = (*deep_px[x, y][:3], 255)
    return cell


def build(grass, deep, idx, frame, variant):
    if idx in INDEX_TO_LURD:
        return build_base(grass, deep, idx, frame, variant)
    if idx in CORNER_EDGES:
        return build_corner(grass, deep, idx, frame, variant)
    return build_cap(grass, deep, idx, frame, variant)


def main():
    plains = Image.open(SRC_PLAINS).convert("RGBA")
    grass = plains.crop((0, 0, CELL, CELL))
    sea = Image.open(SRC_SEA).convert("RGBA")
    # Open water lifted straight from the Sea's own animation, so a Shore tile and
    # the Sea tile beside it shimmer as one body of water.
    deep_frames = [sea.crop((0, f * CELL, CELL, (f + 1) * CELL)) for f in range(FRAMES)]

    sheet = Image.new("RGBA", (CELL * COLS, CELL * FRAMES * VARIANTS), (0, 0, 0, 0))
    for variant in range(VARIANTS):
        for frame in range(FRAMES):
            row = variant * FRAMES + frame
            for idx in range(COLS):
                sheet.paste(
                    build(grass, deep_frames[frame], idx, frame, variant),
                    (idx * CELL, row * CELL),
                )
    sheet.save(OUT)
    print(
        "wrote", OUT, sheet.size, f"({COLS} states x {VARIANTS} variants x {FRAMES} frames)"
    )


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    main()
