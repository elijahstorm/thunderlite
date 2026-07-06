#!/usr/bin/env python3
"""Bridge / High Bridge terrain tiles — a 16-frame connector-1-style rollInto sheet
so a bridge deck autotiles like a road (see spriteConnector `rollIntoWith`). A bridge
"connects" toward any solid bank, so a normal river crossing resolves to a straight
span and only unusual layouts (an over-water elbow or a branch) reach a junction.

  frames indexed by spriteConnector.rollDecision — which cardinal neighbours connect:
    straights + caps (0,1,2,14 horizontal · 12,13,15 vertical) keep the hand-drawn
      SUSPENSION art (towers + catenary cables), reused verbatim from the original
      two-cell sheet — a suspension deck only reads as a straight span.
    junctions (3-11: corners, T's, cross) are drawn flat: a plain teal deck laid
      along the connected arms over sea water, railed at the deck/water boundary. A
      suspension bridge can't physically bend, so the elbow drops the cables.

The original two-cell art is cached to `*_src.png` next to this script the first time
it runs, so re-running rebuilds the straights from the pristine source instead of
from an already-expanded sheet.
"""
import os

from PIL import Image

BASE = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/terrain"
HERE = os.path.dirname(os.path.abspath(__file__))

CELL = 60
FRAMES = 16

# Sheet column -> (left, up, right, down) connected, decoded from
# spriteConnector.rollDecision (order: left, up, right, down). Column N must be the
# frame that decision picks for that neighbour set.
INDEX_TO_LURD = {
    0: (False, False, False, False),
    1: (True, False, False, False),
    2: (True, False, True, False),
    3: (True, True, False, False),
    4: (True, True, False, True),
    5: (True, True, True, True),
    6: (True, True, True, False),
    7: (False, True, True, True),
    8: (True, False, True, True),
    9: (False, True, True, False),
    10: (False, False, True, True),
    11: (True, False, False, True),
    12: (False, True, False, True),
    13: (False, True, False, False),
    14: (False, False, True, False),
    15: (False, False, False, True),
}

# Frames whose connections never leave one axis keep the suspension art: which
# original cell (0 = horizontal deck, 1 = vertical deck) each reuses. Everything else
# is a genuine bend/junction and gets drawn flat.
HORIZONTAL_SUSPENSION = {0, 1, 2, 14}  # no vertical connection
VERTICAL_SUSPENSION = {12, 13, 15}  # vertical-only connection

# The water in every frame is left TRANSPARENT: the map renderer paints an animated
# open-sea tile under the deck (see paint.ts groundLayer), so the ripple shows through
# instead of a static blue being baked in here.
TRANSPARENT = (0, 0, 0, 0)

# The teal the road and suspension decks share; distinguishing the deck fill from its
# dressing (rails, support wires, plank/centre lines) so the dressing can be lifted off
# a straight and stamped onto a road-shaped junction.
DECK_FILL = (83, 108, 108)
DECK_TOL = 22


def clamp(v):
    return max(0, min(255, int(v)))

# The road deck spans this band (rows for a horizontal frame, cols for a vertical
# one); the hand-drawn suspension decks are wider, so they get scaled toward it and
# flush with real roads.
ROAD_LO, ROAD_HI = 7, 52

# The suspension straights read a touch heavy at exactly road width, so let them grow
# a few pixels — but only outward from ONE anchored edge that stays flush with the road
# it meets: a horizontal deck keeps its bottom on ROAD_HI and grows up; a vertical deck
# keeps its left on ROAD_LO and grows right.
GROW = 2

# A junction's deck comes from the road art (curved corners that flush with real
# roads); its bridge dressing is copied off THIS sheet's own straights, so a low bridge
# junction inherits the low straight's pale rails and a high bridge junction inherits
# the high straight's gold rails. `arch` additionally domes the high deck so it reads as
# raised rather than looking identical to the low one.
PALETTE = {
    "bridge": dict(arch=False),
    "high-bridge": dict(arch=True),
}


def is_water(px):
    r, g, b, a = px
    return a > 0 and b > 150 and b - g > 40


def transparentize(cell):
    """Punch out the baked blue water so the animated sea shows through underneath."""
    out = cell.copy()
    px = out.load()
    for y in range(CELL):
        for x in range(CELL):
            if is_water(px[x, y]):
                px[x, y] = TRANSPARENT
    return out


def deck_span(px, axis):
    """First and last index along `axis` ('rows'/'cols') where the deck fills most of
    the tile — i.e. the solid deck band, ignoring sparse cables/rails at the fringes."""
    idx = []
    for i in range(CELL):
        opaque = sum(
            1 for j in range(CELL) if px[(i, j) if axis == "cols" else (j, i)][3] > 0
        )
        if opaque > CELL // 2:
            idx.append(i)
    return (idx[0], idx[-1]) if idx else (ROAD_LO, ROAD_HI)


def fit_to_road(cell, axis):
    """Scale a (transparent-water) suspension straight along its narrow axis toward the
    road's band, GROW pixels larger, anchored on the edge that meets the road: a
    horizontal deck keeps its bottom on ROAD_HI and grows up; a vertical deck keeps its
    left on ROAD_LO and grows right."""
    lo, hi = deck_span(cell.load(), axis)
    # rows: bottom fixed, top extended up. cols: left fixed, right extended.
    target_lo = ROAD_LO - GROW if axis == "rows" else ROAD_LO
    target_hi = ROAD_HI if axis == "rows" else ROAD_HI + GROW
    scale = (target_hi - target_lo) / (hi - lo)
    size = max(1, round(CELL * scale))
    if axis == "rows":
        resized = cell.resize((CELL, size), Image.NEAREST)
        offset = (0, target_lo - round(lo * scale))
    else:
        resized = cell.resize((size, CELL), Image.NEAREST)
        offset = (target_lo - round(lo * scale), 0)
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    out.paste(resized, offset)
    return out


def detail_layer(straight):
    """Lift the bridge dressing off a fitted straight: keep the rails, support wires and
    plank/centre lines, drop the plain deck fill (and the transparent water) so what
    remains can be stamped over a road-shaped deck."""
    out = straight.copy()
    px = out.load()
    for y in range(CELL):
        for x in range(CELL):
            r, g, b, a = px[x, y]
            near_fill = (
                abs(r - DECK_FILL[0]) <= DECK_TOL
                and abs(g - DECK_FILL[1]) <= DECK_TOL
                and abs(b - DECK_FILL[2]) <= DECK_TOL
            )
            if a == 0 or near_fill:
                px[x, y] = TRANSPARENT
    return out


# How far the dressing reaches in from a connected edge. Squished to ~20% of the tile
# so a turn's two arms don't overlap their rails/wires over the bend — the centre of
# the turn stays open road deck, roughly where a real deck's railing would end.
ARM = round(CELL * 0.20)


def arm_dressing(detail, side):
    """This arm's half of the straight's dressing, squished along the arm into the outer
    ARM px from its edge (rest transparent), so the rails/wires frame the approach and
    stop before the turn."""
    c = CELL // 2
    out = Image.new("RGBA", (CELL, CELL), TRANSPARENT)
    if side in ("L", "R"):
        region = detail.crop((0, 0, c, CELL) if side == "L" else (c, 0, CELL, CELL))
        region = region.resize((ARM, CELL), Image.NEAREST)
        out.paste(region, (0, 0) if side == "L" else (CELL - ARM, 0))
    else:
        region = detail.crop((0, 0, CELL, c) if side == "U" else (0, c, CELL, CELL))
        region = region.resize((CELL, ARM), Image.NEAREST)
        out.paste(region, (0, 0) if side == "U" else (0, CELL - ARM))
    return out


def build_junction(pal, road_cell, detail_h, detail_v, L, U, R, D):
    """Deck comes from the road frame for this neighbour set (road indexes the same
    rollDecision order) so corners curve and flush with real roads; the grass becomes
    transparent water. Then stamp the bridge dressing copied off the straights — the
    horizontal straight's rails/wires for a left/right arm, the vertical straight's for
    an up/down arm — clipped to the deck. A High Bridge additionally domes its deck."""
    src = road_cell.load()

    def is_grass(x, y):
        r, g, b, _ = src[x, y]
        return g > r + 8 and g > b + 8

    deck = [[not is_grass(x, y) for y in range(CELL)] for x in range(CELL)]

    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    px = cell.load()
    for y in range(CELL):
        for x in range(CELL):
            px[x, y] = src[x, y] if deck[x][y] else TRANSPARENT

    # High Bridge: a soft convex dome (brighter centre, darker rim) so the deck reads as
    # raised above the water rather than flat like the low bridge.
    if pal["arch"]:
        cx = cy = (CELL - 1) / 2
        for y in range(CELL):
            for x in range(CELL):
                if not deck[x][y]:
                    continue
                r, g, b, a = px[x, y]
                d = min(1.0, ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / (CELL * 0.62))
                f = 1.14 - 0.30 * d
                px[x, y] = (clamp(r * f), clamp(g * f), clamp(b * f), a)

    # Stamp each connected arm's dressing (squished to the outer ARM px), clipped to the
    # deck, so the rails/wires frame the approaches without burying the turn.
    for connected, detail, side in (
        (L, detail_h, "L"),
        (R, detail_h, "R"),
        (U, detail_v, "U"),
        (D, detail_v, "D"),
    ):
        if not connected:
            continue
        ad = arm_dressing(detail, side).load()
        for y in range(CELL):
            for x in range(CELL):
                if deck[x][y] and ad[x, y][3] > 0:
                    px[x, y] = ad[x, y]
    return cell


def load_source(name):
    """Pristine two-cell suspension art. Cached beside this script on first run so a
    rebuild never reads an already-expanded 16-frame sheet."""
    src = f"{HERE}/{name}_src.png"
    if not os.path.exists(src):
        live = Image.open(f"{BASE}/{name}.png").convert("RGBA")
        if live.width != CELL * 2:
            raise SystemExit(
                f"{name}.png is {live.width}px wide, not the pristine {CELL * 2}px; "
                f"restore it or drop a {name}_src.png next to the generator."
            )
        live.save(src)
    return Image.open(src).convert("RGBA")


def build_sheet(name, road):
    pal = PALETTE[name]
    source = load_source(name)
    # Punch out the baked water and slim the deck to the road's width so the straights
    # both flush with roads and let the animated sea ripple through underneath.
    horizontal = fit_to_road(transparentize(source.crop((0, 0, CELL, CELL))), "rows")
    vertical = fit_to_road(transparentize(source.crop((CELL, 0, CELL * 2, CELL))), "cols")
    # Bridge dressing lifted off this sheet's own straights, so junctions inherit its
    # rails/wires (pale for the low bridge, gold for the high one).
    detail_h, detail_v = detail_layer(horizontal), detail_layer(vertical)

    sheet = Image.new("RGBA", (CELL * FRAMES, CELL), (0, 0, 0, 0))
    for idx in range(FRAMES):
        if idx in HORIZONTAL_SUSPENSION:
            cell = horizontal
        elif idx in VERTICAL_SUSPENSION:
            cell = vertical
        else:
            # Road frames share the rollDecision index order, so column idx is the
            # matching road shape.
            road_cell = road.crop((idx * CELL, 0, idx * CELL + CELL, CELL))
            cell = build_junction(pal, road_cell, detail_h, detail_v, *INDEX_TO_LURD[idx])
        sheet.paste(cell, (idx * CELL, 0))
    out = f"{BASE}/{name}.png"
    sheet.save(out)
    print("wrote", out, sheet.size)


def main():
    road = Image.open(f"{BASE}/road.png").convert("RGBA")
    for name in ("bridge", "high-bridge"):
        build_sheet(name, road)


if __name__ == "__main__":
    main()
