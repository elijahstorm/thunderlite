#!/usr/bin/env python3
"""Outrider recon buggy idle sheet.

Approach: draw the buggy as ONE coherent top-down shape (like a paper cut-out),
then sell 2.5D two ways instead of building it from 3D boxes:
  1. squash the whole drawing vertically (SQUASH) to fake the downward camera tilt
  2. extrude a solid dark side-wall under the deck (LIFT) so the body has real
     thickness and we see a sliver of its front/sides -> reads "from above-front".

This stays a single silhouette (no grid-of-outlined-boxes), which is why the
flat top-down read cleanly. 6 state columns x 4 animation rows, 60x60 cells.
"""
import math
import sys, os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from lighting import relight

CELL, COLS, ROWS = 60, 6, 4
W, H = CELL * COLS, CELL * ROWS

# palette sampled from scorpion-tank / stealth-tank
OUTLINE  = (28, 29, 39)
BODY     = (233, 51, 46)     # deck top
BODY_HI  = (255, 144, 133)   # spine highlight
HULL     = (170, 22, 44)     # side walls
HULL_LO  = (120, 18, 40)     # deepest wall / shading
UNDER    = (102, 26, 94)     # cockpit cage purple
METAL    = (82, 75, 72)      # gunmetal (wheels, dish, mast)
METAL_HI = (172, 164, 156)
GLASS    = (120, 200, 230)   # sensor canopy (the recon look)
GLASS_HI = (220, 245, 255)
LIGHT    = (255, 224, 150)   # headlights
TAIL     = (255, 96, 84)     # taillights

# 6 columns = engine states: walk-right, walk-down, walk-left, walk-up,
# stand-right, stand-left. h=0 -> nose points screen-up(north/away); +90 -> nose
# screen-right(east). standing reuses the matching walk heading.
STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62      # vertical compression = camera tilt (1.0 flat top-down, ->0 side)
LIFT   = 6         # deck height in px above the ground footprint
WHEEL_LIFT = 2.0
SCALE  = 1.58      # overall size in the 60px cell (matches the roster footprint)

def rot(f, r, h):
    """local forward/right -> screen dx,dy at heading h (before tilt)."""
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
    # ground discs read as ellipses under the tilt
    x, y = P(cx, cy, h, f, r, lift)
    rx, ry = rad*SCALE, rad*SQUASH*SCALE
    d.ellipse([x-rx, y-ry, x+rx, y+ry], fill=fill, outline=outline)

# top-down body footprint (forward, right): pointed nose, wide middle, tapered tail
BODY_PTS = [(14, 0), (11, -7.5), (-10, -8), (-13, 0), (-10, 8), (11, 7.5)]
DECK_PTS = [(11, 0), (9, -6), (-9, -6.5), (-11, 0), (-9, 6.5), (9, 6)]

def draw_buggy(d, cx, cy, h, frame, moving):
    cy += [0, -1, 0, 1][frame]          # idle/drive bob (shared by stand + walk)

    # dust trailing the rear, on the ground, only while driving
    if moving:
        jit = [0.0, 0.5, -0.4, 0.3][frame]
        for f, rad, tone in [(-15, 1.8, 180), (-17.5, 2.2, 200), (-20, 1.4, 216)]:
            disc(d, cx, cy, h, f + jit, jit, rad, (tone, tone-6, tone-14), lift=0.5)

    # wheels at the four corners, sitting on the ground (drawn under the body)
    for f, r in [(10, -9.5), (10, 9.5), (-10, -9.5), (-10, 9.5)]:
        disc(d, cx, cy, h, f, r, 3.6, OUTLINE, lift=WHEEL_LIFT)
        disc(d, cx, cy, h, f, r, 3.0, METAL, lift=WHEEL_LIFT)
        disc(d, cx, cy, h, f, r, 1.1, METAL_HI, lift=WHEEL_LIFT)

    # dark base footprint (the grounded outline / drop edge)
    poly(d, cx, cy, h, BODY_PTS, OUTLINE, lift=0)

    # extrude the side-wall: stack the footprint from the ground up to the deck
    for i in range(LIFT + 1):
        shade = HULL_LO if i < LIFT * 0.45 else HULL
        poly(d, cx, cy, h, BODY_PTS, shade, lift=i)

    # front bumper / grille bar low on the nose wall
    poly(d, cx, cy, h, [(15, -6), (15, 6), (12, 6), (12, -6)], HULL_LO, lift=1.5)
    line(d, cx, cy, h, (13.5, -6), (13.5, 6), OUTLINE, lift=1.5)

    # deck top + outline (this is the main silhouette edge)
    poly(d, cx, cy, h, BODY_PTS, BODY, lift=LIFT, outline=OUTLINE)
    # spine highlight stripe and rear shading on the deck
    poly(d, cx, cy, h, DECK_PTS, BODY, lift=LIFT)
    poly(d, cx, cy, h, [(10, 0), (7, -3), (-8, -3), (-9, 0), (-8, 3), (7, 3)],
         BODY_HI, lift=LIFT)
    poly(d, cx, cy, h, [(-5, -6), (-11, 0), (-5, 6), (-3, 0)], HULL, lift=LIFT)

    # hood louvers/vents up front + seam splitting hood from cabin
    for vf in (9.5, 7.5, 5.5):
        line(d, cx, cy, h, (vf, -4), (vf, 4), HULL_LO, lift=LIFT)
    line(d, cx, cy, h, (2.5, -6.5), (2.5, 6.5), HULL, lift=LIFT)
    # side rails along the deck edges
    line(d, cx, cy, h, (10, -6.5), (-9, -6.5), BODY_HI, lift=LIFT)
    line(d, cx, cy, h, (10, 6.5), (-9, 6.5), HULL_LO, lift=LIFT)
    # corner rivets
    for rf, rr in [(10, -6.5), (10, 6.5), (-9, -6.5), (-9, 6.5)]:
        disc(d, cx, cy, h, rf, rr, 0.8, OUTLINE, lift=LIFT)

    # headlights on the nose front wall
    disc(d, cx, cy, h, 13.5, -4, 1.5, LIGHT, lift=3.0, outline=OUTLINE)
    disc(d, cx, cy, h, 13.5, 4, 1.5, LIGHT, lift=3.0, outline=OUTLINE)
    # taillights at the rear wall
    disc(d, cx, cy, h, -13, -4, 1.2, TAIL, lift=3.0, outline=OUTLINE)
    disc(d, cx, cy, h, -13, 4, 1.2, TAIL, lift=3.0, outline=OUTLINE)

    # sensor canopy (purple cage + glass) set on the deck toward the rear
    poly(d, cx, cy, h, [(-1, -5), (-8, -5), (-8, 5), (-1, 5)], UNDER,
         lift=LIFT, outline=OUTLINE)
    disc(d, cx, cy, h, -4.5, 0, 3.2, GLASS, lift=LIFT + 1.5, outline=OUTLINE)
    disc(d, cx, cy, h, -5.5, -1.2, 1.2, GLASS_HI, lift=LIFT + 1.5)

    # radar dish on a short mast over the front deck; sweeps a full turn / 4 frames
    sweep = math.radians(frame * 90)
    mast = (4.0, 0.0)
    df = mast[0] + 2.4*math.cos(sweep)
    dr = mast[1] + 2.4*math.sin(sweep)
    m0 = P(cx, cy, h, *mast, lift=LIFT)
    m1 = P(cx, cy, h, df, dr, lift=LIFT + 5)
    d.line([m0, m1], fill=METAL, width=1)
    disc(d, cx, cy, h, df, dr, 2.8, METAL_HI, lift=LIFT + 5, outline=OUTLINE)
    disc(d, cx, cy, h, df, dr, 0.9, METAL, lift=LIFT + 5)

    # whip antenna off the rear corner, with a red tip
    a0 = P(cx, cy, h, -7, -4.5, lift=LIFT)
    a1 = P(cx, cy, h, -7, -4.5, lift=LIFT + 7)
    d.line([a0, a1], fill=METAL_HI, width=1)
    disc(d, cx, cy, h, -7, -4.5, 0.9, TAIL, lift=LIFT + 7)

if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_buggy(d, col*CELL + CELL//2, row*CELL + CELL//2 + 2, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/outrider.png"
    img.save(out)
    print("wrote", out, img.size)
