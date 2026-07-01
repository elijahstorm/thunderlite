#!/usr/bin/env python3
"""Shroud smoke-layer support truck idle sheet.

Same technique as gen_outrider.py: the truck is ONE coherent top-down shape
(a paper cut-out), then sold as 2.5D two ways instead of stacking 3D boxes:
  1. squash the whole drawing vertically (SQUASH) to fake the downward tilt
  2. extrude a solid dark side-wall under the deck (LIFT) so the body has real
     thickness and we glimpse its front/sides -> reads "from above-front".

Design "Shroud": a wheeled support truck (jammer/mortar-truck class, NOT a tank)
with a RACK of upward-angled smoke-launcher TUBES on the rear deck, and soft
BILLOWING SMOKE plumes that grow and dissipate across the 4 animation rows.
The smoke is the unit's identity (it telegraphs concealment). No weapon barrel.

6 state columns x 4 animation rows, 60x60 cells => 360x240.
"""
import math
import sys, os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from lighting import relight

# Tall cell: the smoke plumes rise into a second vertical tile, so the sheet is
# 60w x 120h and unit.ts uses yOffset 60 (the sprite overflows ABOVE its tile).
# The truck is drawn low (on the tile); smoke billows up into the overflow.
CELL_W, CELL_H, COLS, ROWS = 60, 120, 6, 4
W, H = CELL_W * COLS, CELL_H * ROWS

# shared roster palette
OUTLINE  = (28, 29, 39)
BODY     = (233, 51, 46)     # deck top / red
BODY_HI  = (255, 144, 133)   # pink highlight
HULL     = (170, 22, 44)     # dark-red side walls
HULL_LO  = (120, 18, 40)     # deepest wall / shading
UNDER    = (102, 26, 94)     # purple cab / underside cage
METAL    = (82, 75, 72)      # gunmetal (wheels, tubes, mast)
METAL_HI = (172, 164, 156)
WHITE    = (244, 246, 250)   # glints
LIGHT    = (255, 224, 150)   # headlights
TAIL     = (255, 96, 84)     # taillights
# smoke accent grays
SMOKE_LO = (210, 210, 214)
SMOKE_MD = (170, 172, 178)
SMOKE_HI = (236, 237, 240)
SMOKE_DK = (138, 140, 148)

# 6 columns: walk-right, walk-down, walk-left, walk-up, stand-right, stand-left
# h=0 -> nose screen-up(north/away); +90 -> nose screen-right(east).
STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62      # vertical compression = camera tilt
LIFT   = 6         # deck height above the ground footprint
WHEEL_LIFT = 2.0
SCALE  = 1.42      # overall size in the 60px cell

def rot(f, r, h):
    a = math.radians(h)
    return (f*math.sin(a) + r*math.cos(a), -f*math.cos(a) + r*math.sin(a))

def P(cx, cy, h, f, r, lift=0.0):
    dx, dy = rot(f, r, h)
    return (cx + dx*SCALE, cy + (dy*SQUASH - lift)*SCALE)

def poly(d, cx, cy, h, pts, fill, lift=0.0, outline=None):
    d.polygon([P(cx, cy, h, f, r, lift) for f, r in pts], fill=fill, outline=outline)

def line(d, cx, cy, h, a, b, fill, lift=0.0, width=1):
    d.line([P(cx, cy, h, *a, lift), P(cx, cy, h, *b, lift)], fill=fill, width=width)

def disc(d, cx, cy, h, f, r, rad, fill, lift=0.0, outline=None):
    x, y = P(cx, cy, h, f, r, lift)
    rx, ry = rad*SCALE, rad*SQUASH*SCALE
    d.ellipse([x-rx, y-ry, x+rx, y+ry], fill=fill, outline=outline)

def puff(d, x, y, rad, fill, alpha):
    """soft round smoke blob drawn screen-aligned (already squashed look),
    layered onto a separate RGBA so it can be translucent."""
    rx = rad
    ry = rad * 0.86
    d.ellipse([x-rx, y-ry, x+rx, y+ry], fill=fill + (alpha,))

# top-down truck footprint (forward, right): long boxy support chassis,
# blunt nose, flat sides, square tail. Wheeled APC/truck proportions.
BODY_PTS = [(15, -6.5), (15, 6.5), (-14, 6.5), (-14, -6.5)]
CAB_PTS  = [(15, -6), (15, 6), (7, 6), (7, -6)]            # forward cab
DECK_PTS = [(6, -6), (6, 6), (-13, 6), (-13, -6)]          # rear flatbed deck

def draw_shroud(d, smoke_layer, cx, cy, h, frame, moving):
    cy += [0, -1, 0, 1][frame]          # gentle idle/drive bob

    # exhaust haze on the ground behind, only while driving
    if moving:
        jit = [0.0, 0.5, -0.4, 0.3][frame]
        for f, rad, tone in [(-17, 1.6, 188), (-19.5, 2.0, 204), (-22, 1.3, 218)]:
            disc(d, cx, cy, h, f + jit, jit, rad, (tone, tone, tone+4), lift=0.4)

    # six wheels (3 per side) -> reads as a wheeled support truck, not tracks
    for f in (11, 0, -11):
        for r in (-7.5, 7.5):
            disc(d, cx, cy, h, f, r, 3.4, OUTLINE, lift=WHEEL_LIFT)
            disc(d, cx, cy, h, f, r, 2.8, METAL, lift=WHEEL_LIFT)
            disc(d, cx, cy, h, f, r, 1.0, METAL_HI, lift=WHEEL_LIFT)

    # dark grounded footprint (drop edge)
    poly(d, cx, cy, h, BODY_PTS, OUTLINE, lift=0)

    # extrude the side-wall from ground up to deck for thickness
    for i in range(LIFT + 1):
        shade = HULL_LO if i < LIFT * 0.45 else HULL
        poly(d, cx, cy, h, BODY_PTS, shade, lift=i)

    # front bumper / grille bar low on the nose wall
    poly(d, cx, cy, h, [(16, -5), (16, 5), (14, 5), (14, -5)], HULL_LO, lift=1.5)

    # deck top + main silhouette outline
    poly(d, cx, cy, h, BODY_PTS, BODY, lift=LIFT, outline=OUTLINE)

    # --- forward cab (raised, purple windscreen) ---
    poly(d, cx, cy, h, CAB_PTS, BODY, lift=LIFT)
    # cab roof a touch higher, lighter on top-right light
    poly(d, cx, cy, h, [(14, -5), (14, 5), (8, 5), (8, -5)], BODY_HI, lift=LIFT + 1)
    poly(d, cx, cy, h, [(13.5, -5), (13.5, 0.5), (8.5, 0.5), (8.5, -5)],
         BODY, lift=LIFT + 1)
    # windscreen glass band facing forward
    poly(d, cx, cy, h, [(13.5, -4.2), (13.5, 4.2), (11.5, 4.2), (11.5, -4.2)],
         UNDER, lift=LIFT + 1.2, outline=OUTLINE)
    line(d, cx, cy, h, (12.4, -4.2), (12.4, 4.2), (150, 60, 140), lift=LIFT + 1.2)
    # seam splitting cab from rear deck
    line(d, cx, cy, h, (7, -6), (7, 6), HULL_LO, lift=LIFT)
    line(d, cx, cy, h, (6.4, -6), (6.4, 6), BODY_HI, lift=LIFT)

    # rear flatbed deck shading (sits lower / darker than cab roof)
    poly(d, cx, cy, h, DECK_PTS, HULL, lift=LIFT)
    poly(d, cx, cy, h, [(5, -5), (5, 5), (-12, 5), (-12, -5)], BODY, lift=LIFT)
    # deck plank seams
    for sf in (3, 0, -3, -6, -9):
        line(d, cx, cy, h, (sf, -5), (sf, 5), HULL_LO, lift=LIFT)

    # side rails (top-right edge catches light, bottom-left in shadow)
    line(d, cx, cy, h, (15, -6.5), (-14, -6.5), BODY_HI, lift=LIFT)
    line(d, cx, cy, h, (15, 6.5), (-14, 6.5), HULL_LO, lift=LIFT)
    # corner rivets
    for rf, rr in [(15, -6.5), (15, 6.5), (-14, -6.5), (-14, 6.5)]:
        disc(d, cx, cy, h, rf, rr, 0.8, OUTLINE, lift=LIFT)

    # headlights on nose wall, taillights on rear wall
    disc(d, cx, cy, h, 15.5, -4, 1.3, LIGHT, lift=3.0, outline=OUTLINE)
    disc(d, cx, cy, h, 15.5, 4, 1.3, LIGHT, lift=3.0, outline=OUTLINE)
    disc(d, cx, cy, h, -14, -4, 1.1, TAIL, lift=3.0, outline=OUTLINE)
    disc(d, cx, cy, h, -14, 4, 1.1, TAIL, lift=3.0, outline=OUTLINE)

    # --- RACK of smoke-launcher TUBES on the rear deck (the key silhouette) ---
    # a mounting base block on the deck
    poly(d, cx, cy, h, [(-1, -5), (-1, 5), (-11, 5), (-11, -5)], METAL,
         lift=LIFT, outline=OUTLINE)
    poly(d, cx, cy, h, [(-2, -4.5), (-2, 4.5), (-10, 4.5), (-10, -4.5)],
         (66, 60, 58), lift=LIFT)

    # bundle of short upward-angled tubes: a 2x3 cluster of fat barrels pointing
    # up and slightly rearward. each tube is a base disc + a raised muzzle disc.
    tube_h = LIFT + 6.5
    rows_r = (-3.3, 0.0, 3.3)
    cols_f = (-3.5, -7.5)
    for cf in cols_f:
        for rr in rows_r:
            # tube tilts up & back: muzzle shifts rearward (-f) as it rises
            bf, br = cf, rr
            mf, mr = cf - 2.0, rr
            base = P(cx, cy, h, bf, br, lift=LIFT + 0.5)
            top  = P(cx, cy, h, mf, mr, lift=tube_h)
            # tube wall (thick line) + outline by drawing a fat then thin line
            d.line([base, top], fill=OUTLINE, width=4)
            d.line([base, top], fill=METAL, width=2)
            # lit edge on the top-right side of each tube
            br2 = (base[0] + 0.8, base[1])
            top2 = (top[0] + 0.8, top[1])
            d.line([br2, top2], fill=METAL_HI, width=1)
            # muzzle opening (dark ring) at the top
            disc(d, cx, cy, h, mf, mr, 1.5, OUTLINE, lift=tube_h)
            disc(d, cx, cy, h, mf, mr, 1.0, (44, 42, 48), lift=tube_h)
            disc(d, cx, cy, h, mf - 0.3, mr - 0.3, 0.4, SMOKE_DK, lift=tube_h)

    # small antenna whip off the cab corner
    a0 = P(cx, cy, h, 8, -5.5, lift=LIFT)
    a1 = P(cx, cy, h, 8, -5.5, lift=LIFT + 7)
    d.line([a0, a1], fill=METAL_HI, width=1)
    disc(d, cx, cy, h, 8, -5.5, 0.8, TAIL, lift=LIFT + 7)

    # --- BILLOWING SMOKE (the unit identity), drawn on translucent layer ---
    # anchor smoke above the tube cluster; grow + rise + fade across frames.
    # standing frames get wispier (smaller, fainter) plumes.
    anchor = P(cx, cy, h, -6.0, 0.0, lift=tube_h + 1.5)
    ax, ay = anchor
    # growth phase 0..3 (loops). moving = denser deploy; standing = idle wisp.
    grow = [0.45, 0.7, 1.0, 0.75][frame]
    base_alpha = 165 if moving else 96
    rise = frame * 2.2

    # cluster of overlapping puffs forming one billowing cloud
    blobs = [
        # (dx, dy, radius, tone, alpha_scale)
        (0,    -2,  6.2, SMOKE_MD, 0.85),
        (-3.5, -1,  4.8, SMOKE_LO, 0.95),
        (3.5,  -1,  4.6, SMOKE_LO, 0.9),
        (-1.5, -5,  4.4, SMOKE_LO, 0.8),
        (2.0,  -5.5,4.0, SMOKE_HI, 0.7),
        (0,    -8,  3.4, SMOKE_HI, 0.55),
        (-4.5, -4,  3.2, SMOKE_MD, 0.6),
        (4.5,  -4,  3.0, SMOKE_MD, 0.55),
    ]
    for dx, dy, rad, tone, asc in blobs:
        r = rad * (0.7 + 0.55 * grow)
        a = int(base_alpha * asc * (0.55 + 0.55 * grow))
        a = max(0, min(255, a))
        puff(smoke_layer, ax + dx, ay + dy - rise, r, tone, a)
    # a couple bright top glints to give the cloud volume in the light
    puff(smoke_layer, ax + 1.5, ay - 6 - rise, 2.0 * (0.7 + 0.4*grow),
         SMOKE_HI, max(0, min(255, int(base_alpha * 0.9))))

if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # separate translucent layer for smoke so plumes can blend over the truck
    smoke = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(smoke)
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_shroud(d, sd, col*CELL_W + CELL_W//2, row*CELL_H + 90,
                        h, row, moving)
    relight(img)  # light the truck before the translucent smoke is laid over it
    img = Image.alpha_composite(img, smoke)

    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/shroud.png"
    img.save(out)
    print("wrote", out, img.size)
