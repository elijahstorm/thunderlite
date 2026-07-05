#!/usr/bin/env python3
"""Albatross Gunship idle sheet — lumbering twin-prop ground-attack gunship.

AIRCRAFT sheet: tall 60x120 cells (360x480, unit.ts yOffset 60), hover bob,
single squashed-and-extruded silhouette per the roster recipe.

Silhouette cues:
  - fat slab fuselage with a chin gun turret
  - broad straight wings with twin engine nacelles and spinning props
  - high tail with wide stabilizer
"""
import math
import sys, os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from lighting import relight

CELL_W, CELL_H, COLS, ROWS = 60, 120, 6, 4
W, H = CELL_W * COLS, CELL_H * ROWS

OUTLINE  = (28, 29, 39)
BODY     = (233, 51, 46)
BODY_HI  = (255, 144, 133)
HULL     = (170, 22, 44)
HULL_LO  = (120, 18, 40)
UNDER    = (102, 26, 94)
METAL    = (82, 75, 72)
METAL_HI = (172, 164, 156)
WHITE    = (255, 255, 255)

STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62
LIFT   = 4          # deep-bellied airframe
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

# slab fuselage (forward, right)
FUSE = [(12, -2.2), (13, 0), (12, 2.2), (8, 4.2), (-9, 4.2), (-12, 2.4), (-12, -2.4), (-9, -4.2), (8, -4.2)]
# broad straight wing, one side
def wing(s):
    return [(3.5, 4.0*s), (2.5, 16.5*s), (-1.5, 16.5*s), (-2.5, 4.0*s)]
# engine nacelle on the wing
def nacelle(s):
    return [(6.5, 8.2*s), (6.5, 11.2*s), (-2, 11.2*s), (-2, 8.2*s)]

def prop(d, cx, cy, h, f, r, frame, moving, lift):
    """two-blade prop; blade angle steps per frame when moving."""
    ang = (frame * 45 if moving else 20)
    a = math.radians(ang)
    br = 4.4
    df, dr = math.cos(a)*br, math.sin(a)*br
    # thin prop-arc ring when spinning (ImageDraw doesn't alpha-blend, so a
    # translucent disc would punch holes in the wing below — outline only)
    if moving:
        x, y = P(cx, cy, h, f, r, lift)
        rx, ry = br*SCALE, br*SQUASH*SCALE
        d.ellipse([x-rx, y-ry, x+rx, y+ry], outline=(210, 210, 220), width=1)
    line(d, cx, cy, h, (f - df*0.12 + df, r + dr), (f - df, r - dr), METAL_HI, lift=lift, width=2)
    disc(d, cx, cy, h, f, r, 1.0, METAL, lift=lift, outline=OUTLINE)

def draw_albatross(d, cx, cy, h, frame, moving):
    # soft ground shadow at tile level (roster air-unit convention)
    d.ellipse([cx - 15, cy + 15, cx + 15, cy + 24], fill=(3, 5, 3, 129))
    cy += [0, -1, 0, 1][frame] * 1.0     # heavy hover bob

    # wings (thin extrusion) under the fuselage spine
    for s in (1, -1):
        poly(d, cx, cy, h, wing(s), OUTLINE, lift=0)
        for i in range(2):
            poly(d, cx, cy, h, wing(s), HULL_LO if i == 0 else HULL, lift=i + 1)
        poly(d, cx, cy, h, wing(s), BODY, lift=LIFT - 1, outline=OUTLINE)
        line(d, cx, cy, h, (2.8, 15.8*s), (-1.2, 15.8*s), BODY_HI, lift=LIFT - 1)

    # engine nacelles + props
    for s in (1, -1):
        for i in range(3):
            poly(d, cx, cy, h, nacelle(s), (60, 55, 53) if i == 0 else METAL, lift=LIFT - 2 + i)
        poly(d, cx, cy, h, nacelle(s), METAL, lift=LIFT + 1, outline=OUTLINE)
        line(d, cx, cy, h, (6, 8.6*s), (-1.5, 8.6*s), METAL_HI, lift=LIFT + 1)

    # fuselage extrusion (deep belly)
    poly(d, cx, cy, h, FUSE, OUTLINE, lift=0)
    for i in range(LIFT + 1):
        poly(d, cx, cy, h, FUSE, HULL_LO if i < LIFT * 0.5 else HULL, lift=i)
    poly(d, cx, cy, h, FUSE, BODY, lift=LIFT, outline=OUTLINE)
    # deck details
    poly(d, cx, cy, h, [(10, -1.4), (11, 0), (10, 1.4), (-8, 1.8), (-8, -1.8)], BODY_HI, lift=LIFT)
    line(d, cx, cy, h, (5, -4.2), (5, 4.2), HULL_LO, lift=LIFT)
    line(d, cx, cy, h, (-4, -4.2), (-4, 4.2), HULL_LO, lift=LIFT)

    # cockpit glass strip near the nose
    poly(d, cx, cy, h, [(10.5, -1.6), (10.5, 1.6), (8, 2.4), (8, -2.4)],
         UNDER, lift=LIFT + 0.6, outline=OUTLINE)
    line(d, cx, cy, h, (10, -1.2), (8.5, -1.8), (168, 120, 188), lift=LIFT + 0.6)

    # chin gun turret slung under the nose
    disc(d, cx, cy, h, 8.5, 0, 2.2, METAL, lift=0.6, outline=OUTLINE)
    swing = [0, 0.6, 0, -0.6][frame]
    line(d, cx, cy, h, (8.5, swing*0.3), (12.5, swing), METAL_HI, lift=0.6, width=2)

    # rocket stub pods under the inner wings (the "I'm a gunship" cue)
    for s in (1, -1):
        poly(d, cx, cy, h, [(1.5, 5.6*s), (1.5, 7.4*s), (-1.5, 7.4*s), (-1.5, 5.6*s)],
             UNDER, lift=1, outline=OUTLINE)
        disc(d, cx, cy, h, 1.2, 6.5*s, 0.55, WHITE, lift=1)

    # high tail: fin + wide stabilizer
    poly(d, cx, cy, h, [(-9, -0.8), (-12.5, -0.8), (-12.5, 0.8), (-9, 0.8)],
         HULL, lift=LIFT + 3, outline=OUTLINE)
    poly(d, cx, cy, h, [(-10.5, -6.5), (-9.5, 0), (-10.5, 6.5), (-12.5, 6.5), (-12.5, -6.5)],
         BODY, lift=LIFT + 3, outline=OUTLINE)
    line(d, cx, cy, h, (-10.8, -5.8), (-10.8, 5.8), BODY_HI, lift=LIFT + 3)

    # props last so they read over the wing
    for s in (1, -1):
        prop(d, cx, cy, h, 7.2, 9.7*s, frame, moving, lift=LIFT)

if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_albatross(d, col*CELL_W + CELL_W//2, row*CELL_H + 88, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/albatross-gunship.png"
    img.save(out)
    print("wrote", out, img.size)
