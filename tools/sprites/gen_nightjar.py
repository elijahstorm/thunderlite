#!/usr/bin/env python3
"""Nightjar idle sheet — cloaked flying-wing infiltrator.

Same single-silhouette 2.5D technique as the rest of the roster (squash +
extrude + the shared relight pass), an AIRCRAFT on the tall 60x120 cell grid
(sheet 360x480, unit.ts yOffset 60) like the Raptor/Petrel/Kestrel.

It has to read as the ODD ONE OUT among the aircraft: where the others are
winged darts, deltas or a rotor drone, the Nightjar is a tailless bat/manta
flying wing — the universal "stealth" silhouette. It is drawn a step DARKER than
the roster (top face is HULL, not BODY) so it stays low-visibility even at the
50% alpha its owner sees while it is cloaked. Its signature accent is a cold
VIOLET cloak-shimmer that sweeps across the wing per frame instead of a bright
engine plume (a plume would fight the "silent/hidden" fantasy). Exhaust is a
pair of tiny, cool, near-invisible embers at the trailing notch.
"""
import math
import sys, os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from lighting import relight

CELL_W, CELL_H, COLS, ROWS = 60, 120, 6, 4
W, H = CELL_W * COLS, CELL_H * ROWS

# shared roster palette (the red ramp here is what the colouriser swaps per team)
OUTLINE  = (28, 29, 39)
BODY     = (233, 51, 46)
BODY_HI  = (255, 144, 133)
HULL     = (170, 22, 44)
HULL_LO  = (120, 18, 40)
UNDER    = (102, 26, 94)
METAL    = (82, 75, 72)
METAL_HI = (172, 164, 156)
WHITE    = (255, 255, 255)
# cold violet cloak-shimmer (this unit's signature, like the Petrel's storm-blue).
# Sits OUTSIDE the red ramp, so imageColorizer leaves it untouched on every team.
VIOLET_D = (86, 58, 140)
VIOLET_B = (150, 120, 230)
VIOLET_W = (210, 196, 248)

STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62
LIFT   = 3
SCALE  = 1.5

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

# Full flying-wing planform (both halves in one loop — no centre seam). A broad
# forward-swept crescent with the classic notched ("W") trailing edge.
PLAN = [
    (12.5, 0.0),      # nose point
    (10.5, 2.6),
    (2.0, 12.5),      # right leading sweep
    (-5.0, 14.5),     # right wingtip
    (-6.8, 13.2),     # wingtip trailing
    (-3.2, 4.2),      # trailing edge inboard
    (-7.5, 1.6),      # trailing notch (right of centre)
    (-8.6, 0.0),      # centre trailing point
    (-7.5, -1.6),     # mirror back around ...
    (-3.2, -4.2),
    (-6.8, -13.2),
    (-5.0, -14.5),
    (2.0, -12.5),
    (10.5, -2.6),
]
# raised centre hump (cockpit spine)
HUMP = [(8.5, -2.2), (8.5, 2.2), (-2.0, 3.0), (-4.5, 2.4), (-4.5, -2.4), (-2.0, -3.0)]

def draw_nightjar(d, cx, cy, h, frame, moving):
    # soft ground shadow — wide, to match the broad wing (roster air units bake one).
    d.ellipse([cx - 16, cy + 15, cx + 16, cy + 22], fill=(3, 5, 3, 129))
    cy += [0, -1, 0, 1][frame] * 1.0     # hover bob

    # flying-wing body, extruded. Top face is HULL (a step darker than BODY) so the
    # craft reads as a low-visibility shadow next to the brighter fighters.
    poly(d, cx, cy, h, PLAN, OUTLINE, lift=0)
    for i in range(LIFT + 1):
        poly(d, cx, cy, h, PLAN, UNDER if i < LIFT * 0.4 else HULL_LO, lift=i)
    poly(d, cx, cy, h, PLAN, HULL, lift=LIFT, outline=OUTLINE)

    # thin leading-edge highlight so the swept wing catches the key light
    line(d, cx, cy, h, (11.5, 0.0), (2.5, 11.0), BODY, lift=LIFT)
    line(d, cx, cy, h, (11.5, 0.0), (2.5, -11.0), BODY, lift=LIFT)

    # centre hump / cockpit spine
    poly(d, cx, cy, h, HUMP, HULL_LO, lift=LIFT)
    poly(d, cx, cy, h, HUMP, HULL, lift=LIFT + 1, outline=OUTLINE)
    # violet canopy slit set into the hump
    poly(d, cx, cy, h, [(7.0, -1.0), (7.0, 1.0), (2.0, 1.4), (2.0, -1.4)],
         VIOLET_D, lift=LIFT + 1.4, outline=OUTLINE)
    line(d, cx, cy, h, (6.4, -0.5), (2.6, -0.9), VIOLET_B, lift=LIFT + 1.4)

    # cloak-shimmer: a cold violet band sweeping across the span, position keyed to
    # the animation frame (the "about to vanish" tell). Rides just above the wing.
    sweep = [-9.0, -3.0, 3.0, 9.0][frame]
    s0, s1 = sweep - 2.4, sweep + 2.4
    line(d, cx, cy, h, (4.0, s0), (-4.5, s0 * 0.75), VIOLET_D, lift=LIFT + 0.5, width=2)
    line(d, cx, cy, h, (4.0, sweep), (-4.5, sweep * 0.75), VIOLET_B, lift=LIFT + 0.6)
    line(d, cx, cy, h, (4.0, s1), (-4.5, s1 * 0.75), VIOLET_D, lift=LIFT + 0.5, width=1)

    # suppressed exhaust — two tiny cool embers at the trailing notch, barely lit
    # (no plume; silence made visible). A hair brighter/longer when moving.
    glow = VIOLET_B if moving else VIOLET_D
    for s in (1, -1):
        disc(d, cx, cy, h, -8.4, 1.4*s, 0.6, glow, lift=LIFT + 0.4)
    if moving and frame in (1, 3):
        for s in (1, -1):
            disc(d, cx, cy, h, -9.6, 1.4*s, 0.4, VIOLET_W, lift=LIFT + 0.4)

if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_nightjar(d, col*CELL_W + CELL_W//2, row*CELL_H + 86, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/nightjar.png"
    img.save(out)
    print("wrote", out, img.size)
