#!/usr/bin/env python3
"""Petrel Stormrider idle sheet — sleek storm-riding interceptor.

Same single-silhouette 2.5D technique as the ground roster (squash + extrude),
but an AIRCRAFT: tall 60x120 cells (sheet 360x480, unit.ts yOffset 60) like the
Raptor/Condor/Vulture, body drawn low in the cell with a hover bob.

Silhouette cues that say "storm rider":
  - slim dart fuselage with swept-back delta wings and forward canards
  - twin tail fins
  - cool storm-blue engine wash off the tail (flickers, longer when moving)
"""
import math
import sys, os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from lighting import relight

CELL_W, CELL_H, COLS, ROWS = 60, 120, 6, 4
W, H = CELL_W * COLS, CELL_H * ROWS

# shared roster palette
OUTLINE  = (28, 29, 39)
BODY     = (233, 51, 46)
BODY_HI  = (255, 144, 133)
HULL     = (170, 22, 44)
HULL_LO  = (120, 18, 40)
UNDER    = (102, 26, 94)
METAL    = (82, 75, 72)
METAL_HI = (172, 164, 156)
WHITE    = (255, 255, 255)
# storm-blue accent (this unit's signature, like the Scorcher's flame)
STORM_D  = (60, 110, 200)
STORM_B  = (140, 190, 255)
STORM_W  = (225, 240, 255)

STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62
LIFT   = 3          # slim airframe
SCALE  = 1.55

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

# dart fuselage footprint (forward, right) — long and narrow
FUSE = [(14, -1.2), (14, 1.2), (9, 2.4), (-11, 2.4), (-13, 1.4), (-13, -1.4), (-11, -2.4), (9, -2.4)]
# swept delta wing (one side; mirrored by sign)
def wing(s):
    return [(4, 2.2*s), (-3, 12.5*s), (-7.5, 12.5*s), (-6, 2.2*s)]
# forward canard
def canard(s):
    return [(9.5, 2.0*s), (7, 6.0*s), (5.5, 6.0*s), (6.5, 2.0*s)]

def draw_petrel(d, cx, cy, h, frame, moving):
    # soft ground shadow (roster air units carry one; anchors the craft to its
    # tile). Drawn at ground level, unaffected by the hover bob.
    d.ellipse([cx - 13, cy + 15, cx + 13, cy + 23], fill=(3, 5, 3, 129))
    cy += [0, -1, 0, 1][frame] * 1.1     # hover bob

    # wings first, extruded thin so they sit under the spine
    for s in (1, -1):
        poly(d, cx, cy, h, wing(s), OUTLINE, lift=0)
        for i in range(LIFT):
            poly(d, cx, cy, h, wing(s), HULL_LO if i < 1 else HULL, lift=i)
        poly(d, cx, cy, h, wing(s), BODY, lift=LIFT, outline=OUTLINE)
        # wingtip storm-vane stripe
        line(d, cx, cy, h, (-3, 11.5*s), (-7.2, 11.5*s), STORM_B, lift=LIFT)
        # canards
        poly(d, cx, cy, h, canard(s), HULL, lift=LIFT - 1)
        poly(d, cx, cy, h, canard(s), BODY, lift=LIFT, outline=OUTLINE)

    # fuselage extrusion
    poly(d, cx, cy, h, FUSE, OUTLINE, lift=0)
    for i in range(LIFT + 1):
        poly(d, cx, cy, h, FUSE, HULL_LO if i < LIFT * 0.5 else HULL, lift=i)
    poly(d, cx, cy, h, FUSE, BODY, lift=LIFT, outline=OUTLINE)
    # spine highlight down the centre
    poly(d, cx, cy, h, [(12, -0.7), (12, 0.7), (-10, 0.9), (-10, -0.9)], BODY_HI, lift=LIFT)

    # cockpit canopy (storm-blue glass) just behind the nose
    poly(d, cx, cy, h, [(8.5, -1.2), (8.5, 1.2), (4.5, 1.7), (4.5, -1.7)],
         STORM_D, lift=LIFT + 0.8, outline=OUTLINE)
    line(d, cx, cy, h, (8, -0.8), (5, -1.2), STORM_B, lift=LIFT + 0.8)

    # twin tail fins — drawn as raised blades near the rear
    for s in (1, -1):
        poly(d, cx, cy, h, [(-9, 1.8*s), (-12.5, 3.6*s), (-12.5, 4.6*s), (-8, 2.6*s)],
             HULL, lift=LIFT + 2, outline=OUTLINE)
    # tailplane hint
    line(d, cx, cy, h, (-11.5, -4), (-11.5, 4), HULL_LO, lift=LIFT + 1)

    # intake cheeks (gunmetal) either side of the cockpit
    for s in (1, -1):
        poly(d, cx, cy, h, [(5, 2.0*s), (5, 3.1*s), (0, 3.1*s), (0, 2.0*s)],
             METAL, lift=LIFT, outline=OUTLINE)
        disc(d, cx, cy, h, 4.2, 2.55*s, 0.5, METAL_HI, lift=LIFT)

    # storm-blue engine wash off the tail, flickering; longer when moving
    flick = [0.0, 1.1, 0.4, 1.6][frame]
    # keep tail + wash within the 30px half-cell: (13.2 + reach) * SCALE <= 29
    reach = (4.0 if moving else 2.5) + flick * 0.8
    fr = [0.0, 0.35, -0.3, 0.15][frame]
    tail = -13.2
    poly(d, cx, cy, h, [(tail, fr - 1.5), (tail, fr + 1.5),
                        (tail - reach*0.7, fr + 0.6), (tail - reach, fr),
                        (tail - reach*0.7, fr - 0.6)],
         STORM_D, lift=LIFT + 0.6)
    poly(d, cx, cy, h, [(tail, fr - 0.9), (tail, fr + 0.9), (tail - reach*0.6, fr)],
         STORM_B, lift=LIFT + 0.6)
    disc(d, cx, cy, h, tail - 0.6, fr, 0.7, STORM_W, lift=LIFT + 0.6)

if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_petrel(d, col*CELL_W + CELL_W//2, row*CELL_H + 88, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/petrel-stormrider.png"
    img.save(out)
    print("wrote", out, img.size)
