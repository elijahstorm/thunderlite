#!/usr/bin/env python3
"""Shrike Interdictor idle sheet — a long-reach missile-carrier aircraft.

Same single-silhouette 2.5D technique as the rest of the air roster (squash +
extrude), tall 60x120 cells (sheet 360x480, unit.ts yOffset 60) like the
Petrel/Albatross, body drawn low in the cell with a hover bob.

Silhouette cues that say "standoff missile interdictor":
  - broad straight wing carrying two underwing missile rails (its whole point)
  - stout twin-intake fuselage with a bulged sensor/radar nose
  - a single tall swept tail fin
  - a warning-amber sensor eye + amber engine wash (its signature accent, the
    way the Petrel's is storm-blue)
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
# warning-amber accent (this unit's signature, like the Petrel's storm-blue)
AMBER_D  = (196, 118, 24)
AMBER_B  = (255, 190, 78)
AMBER_W  = (255, 240, 205)
# live ordnance on the rails
TIP      = (232, 226, 214)

STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62
LIFT   = 4          # a chunkier airframe than the Petrel's dart
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

# stout fuselage footprint (forward, right) — bulged sensor nose up front
FUSE = [(13, -1.6), (13.5, 0), (13, 1.6), (8, 2.8), (-12, 2.8),
        (-13.5, 1.6), (-13.5, -1.6), (-12, -2.8), (8, -2.8)]
# broad straight wing (one side; mirrored by sign)
def wing(s):
    return [(3, 2.6*s), (2, 13.5*s), (-4, 13.5*s), (-5.5, 2.6*s)]
# underwing missile body, slung mid-wing (one side)
def missile(s):
    return [(5, 8.0*s), (5, 9.6*s), (-6, 9.6*s), (-7.5, 8.8*s), (-6, 8.0*s)]

def draw_shrike(d, cx, cy, h, frame, moving):
    # soft ground shadow (roster air units carry one; anchors the craft to its
    # tile). Drawn at ground level, unaffected by the hover bob.
    d.ellipse([cx - 15, cy + 15, cx + 15, cy + 23], fill=(3, 5, 3, 129))
    cy += [0, -1, 0, 1][frame] * 1.0     # hover bob (heavier craft, shallower)

    # wings first, extruded so they sit under the spine
    for s in (1, -1):
        poly(d, cx, cy, h, wing(s), OUTLINE, lift=0)
        for i in range(LIFT):
            poly(d, cx, cy, h, wing(s), HULL_LO if i < 1 else HULL, lift=i)
        poly(d, cx, cy, h, wing(s), BODY, lift=LIFT, outline=OUTLINE)
        # underwing missile rail + ordnance
        for i in range(2):
            poly(d, cx, cy, h, missile(s), METAL if i < 1 else METAL_HI, lift=1 + i)
        poly(d, cx, cy, h, missile(s), METAL_HI, lift=2, outline=OUTLINE)
        disc(d, cx, cy, h, 5, 8.8*s, 0.7, AMBER_B, lift=2)      # seeker head glow
        line(d, cx, cy, h, (-6, 9.6*s), (-7.4, 8.8*s), TIP, lift=2)  # fins

    # fuselage extrusion
    poly(d, cx, cy, h, FUSE, OUTLINE, lift=0)
    for i in range(LIFT + 1):
        poly(d, cx, cy, h, FUSE, HULL_LO if i < LIFT * 0.5 else HULL, lift=i)
    poly(d, cx, cy, h, FUSE, BODY, lift=LIFT, outline=OUTLINE)
    # spine highlight down the centre
    poly(d, cx, cy, h, [(11, -0.8), (11, 0.8), (-11, 1.0), (-11, -1.0)], BODY_HI, lift=LIFT)

    # bulged sensor/radar nose (amber eye) up front
    disc(d, cx, cy, h, 11.5, 0, 2.0, AMBER_D, lift=LIFT + 0.4, outline=OUTLINE)
    disc(d, cx, cy, h, 11.8, 0, 1.1, AMBER_B, lift=LIFT + 0.6)
    disc(d, cx, cy, h, 12.0, -0.3, 0.5, AMBER_W, lift=LIFT + 0.6)

    # cockpit canopy just behind the sensor nose
    poly(d, cx, cy, h, [(7.5, -1.3), (7.5, 1.3), (3.5, 1.8), (3.5, -1.8)],
         METAL, lift=LIFT + 0.8, outline=OUTLINE)
    line(d, cx, cy, h, (7, -0.9), (4, -1.3), METAL_HI, lift=LIFT + 0.8)

    # single tall swept tail fin near the rear
    poly(d, cx, cy, h, [(-10.5, -0.6), (-13.5, 0.4), (-13, 0.9), (-9.5, 0.6)],
         HULL, lift=LIFT + 3, outline=OUTLINE)
    # tailplane hint
    line(d, cx, cy, h, (-12.5, -3.4), (-12.5, 3.4), HULL_LO, lift=LIFT + 1)

    # intake cheeks (gunmetal) either side of the cockpit
    for s in (1, -1):
        poly(d, cx, cy, h, [(4, 2.2*s), (4, 3.3*s), (-1, 3.3*s), (-1, 2.2*s)],
             METAL, lift=LIFT, outline=OUTLINE)
        disc(d, cx, cy, h, 3.2, 2.75*s, 0.5, METAL_HI, lift=LIFT)

    # amber engine wash off the tail, flickering; longer when moving
    flick = [0.0, 1.0, 0.4, 1.4][frame]
    # keep tail + wash within the 30px half-cell: (13.5 + reach) * SCALE <= 29
    reach = (3.6 if moving else 2.3) + flick * 0.7
    fr = [0.0, 0.3, -0.25, 0.15][frame]
    tail = -13.5
    poly(d, cx, cy, h, [(tail, fr - 1.6), (tail, fr + 1.6),
                        (tail - reach*0.7, fr + 0.6), (tail - reach, fr),
                        (tail - reach*0.7, fr - 0.6)],
         AMBER_D, lift=LIFT + 0.6)
    poly(d, cx, cy, h, [(tail, fr - 0.9), (tail, fr + 0.9), (tail - reach*0.6, fr)],
         AMBER_B, lift=LIFT + 0.6)
    disc(d, cx, cy, h, tail - 0.6, fr, 0.7, AMBER_W, lift=LIFT + 0.6)

if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_shrike(d, col*CELL_W + CELL_W//2, row*CELL_H + 88, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/shrike-interdictor.png"
    img.save(out)
    print("wrote", out, img.size)
