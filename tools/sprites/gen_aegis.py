#!/usr/bin/env python3
"""Aegis shield-projector idle sheet.

Same 2.5D recipe as gen_outrider.py: draw ONE coherent top-down silhouette
(NOT a grid of outlined boxes), then sell the downward camera tilt two ways:
  1. squash the whole drawing vertically (SQUASH) for the camera pitch
  2. extrude a solid dark side-wall under the deck (LIFT) for real thickness

The Aegis is a heavy, broad armored support chassis on treads (warmachine /
annihilator class). Where a turret/cannon would sit, it mounts a glowing
SHIELD-EMITTER: a gunmetal dome ringed by a cyan energy coil with a raised
projector node on top -> reads as defensive tech, NOT a gun. Its signature is a
faint translucent PULSING ENERGY FIELD: a cyan hex/ring dome that breathes
(expands + brightens, then contracts) across the 4 animation rows, hovering over
the emitter. No weapon barrel.

6 state columns x 4 animation rows, 60x60 cells => 360x240.
"""
import math
import sys, os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from lighting import relight

# Tall cell: the shield dome + pulsing energy field rise into a second vertical
# tile, so the sheet is 60w x 120h and unit.ts uses yOffset 60 (the sprite
# overflows ABOVE its tile). The chassis is drawn low (on the tile); the field
# breathes up into the overflow.
CELL_W, CELL_H, COLS, ROWS = 60, 120, 6, 4
W, H = CELL_W * COLS, CELL_H * ROWS

# shared roster palette
OUTLINE  = (28, 29, 39)
BODY     = (233, 51, 46)     # deck top / red armor
BODY_HI  = (255, 144, 133)   # pink highlight
HULL     = (170, 22, 44)     # dark-red side walls
HULL_LO  = (120, 18, 40)     # deepest wall / shading
UNDER    = (102, 26, 94)     # purple under-cage
METAL    = (82, 75, 72)      # gunmetal (treads, emitter dome)
METAL_HI = (172, 164, 156)
WHITE    = (255, 255, 255)
# energy shield cyan
EN_CORE  = (150, 230, 255)
EN_BRT   = (210, 250, 255)

# 6 columns: walk-right, walk-down, walk-left, walk-up, stand-right, stand-left.
# h=0 -> nose points screen-up(north/away); +90 -> nose screen-right(east).
STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62
LIFT   = 5          # the Aegis is tanky but kept low so its base reads as grounded
SCALE  = 1.56       # broad heavy footprint fills the cell
TREAD_LIFT = 1.6

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

def disc_xy(d, x, y, rx, ry, fill, outline=None):
    d.ellipse([x-rx, y-ry, x+rx, y+ry], fill=fill, outline=outline)

# broad armored top-down footprint (forward, right): blunt nose, very wide body
BODY_PTS = [(13, -8), (13, 8), (-13, 9), (-15, 0), (-13, -9)]
DECK_PTS = [(11, -7), (11, 7), (-11, 8), (-13, 0), (-11, -8)]

# tread footprints sit just outside the hull on the left/right flanks
def tread(d, cx, cy, h, side):
    # side: -1 left flank, +1 right flank (right = +r)
    r0 = 9.5 * side
    pts = [(12, r0 - 2.4*side), (12, r0 + 2.4*side),
           (-13, r0 + 2.4*side), (-13, r0 - 2.4*side)]
    # ordered so it's a clean quad regardless of side sign
    quad = [(12, r0 - 2.4), (12, r0 + 2.4), (-13, r0 + 2.4), (-13, r0 - 2.4)]
    # grounded dark base
    poly(d, cx, cy, h, quad, OUTLINE, lift=0)
    for i in range(int(TREAD_LIFT*2) + 1):
        poly(d, cx, cy, h, quad, METAL, lift=i*0.5)
    poly(d, cx, cy, h, quad, METAL, lift=TREAD_LIFT, outline=OUTLINE)
    # tread cleats
    for f in range(-11, 12, 3):
        line(d, cx, cy, h, (f, r0 - 2.2), (f, r0 + 2.2), OUTLINE, lift=TREAD_LIFT)
    # top rail highlight
    line(d, cx, cy, h, (11, r0 - 2.2), (-12, r0 - 2.2), METAL_HI, lift=TREAD_LIFT)


def draw_aegis(d, cx, cy, h, frame, moving):
    cy += [0, -1, 0, 1][frame] if moving else [0, -1, 0, -1][frame] * 0.5

    # treads first (drawn under the body), both flanks
    tread(d, cx, cy, h, -1)
    tread(d, cx, cy, h, +1)

    # dark grounded base / drop edge
    poly(d, cx, cy, h, BODY_PTS, OUTLINE, lift=0)
    # extrude the side-wall up to the deck
    for i in range(LIFT + 1):
        shade = HULL_LO if i < LIFT * 0.5 else HULL
        poly(d, cx, cy, h, BODY_PTS, shade, lift=i)

    # front armor lip / bumper low on the nose wall
    poly(d, cx, cy, h, [(14, -7), (14, 7), (12.5, 7), (12.5, -7)], HULL_LO, lift=1.6)

    # deck top + main silhouette outline
    poly(d, cx, cy, h, BODY_PTS, BODY, lift=LIFT, outline=OUTLINE)
    poly(d, cx, cy, h, DECK_PTS, BODY, lift=LIFT)
    # broad pink highlight panel toward the front-right (light from top-right)
    poly(d, cx, cy, h, [(10, -6), (10, 4), (-8, 5), (-9, -6)], BODY_HI, lift=LIFT)
    # rear shading wedge
    poly(d, cx, cy, h, [(-7, -7), (-13, 0), (-7, 8), (-4, 0)], HULL, lift=LIFT)

    # armor plate seams across the deck
    for sf in (6.0, 0.0, -6.0):
        line(d, cx, cy, h, (sf, -7), (sf, 7.5), HULL_LO, lift=LIFT)
    # side rails
    line(d, cx, cy, h, (12, -7), (-12, -8.5), BODY_HI, lift=LIFT)
    line(d, cx, cy, h, (12, 7), (-12, 8.5), HULL_LO, lift=LIFT)
    # corner bolts
    for rf, rr in [(11, -7), (11, 7), (-11, -7.5), (-11, 7.5)]:
        disc(d, cx, cy, h, rf, rr, 0.9, OUTLINE, lift=LIFT)

    # purple support cowl ringing the emitter base (defensive-tech cue)
    poly(d, cx, cy, h, [(7, -8), (7, 8), (-9, 8), (-9, -8)], UNDER,
         lift=LIFT, outline=OUTLINE)
    line(d, cx, cy, h, (7, -8), (7, 8), BODY_HI, lift=LIFT)

    # ---- SHIELD EMITTER (where a turret would be) ----
    ef, er = -1.0, 0.0   # emitter sits center-rear of the deck
    base_lift = LIFT + 1.0
    # gunmetal base ring
    disc(d, cx, cy, h, ef, er, 5.2, OUTLINE, lift=base_lift)
    disc(d, cx, cy, h, ef, er, 4.6, METAL, lift=base_lift)
    disc(d, cx, cy, h, ef, er, 3.0, METAL_HI, lift=base_lift)
    # cyan energy coil ring around the dome
    cx0, cy0 = P(cx, cy, h, ef, er, lift=base_lift + 2.2)
    disc(d, cx, cy, h, ef, er, 3.6, EN_CORE, lift=base_lift + 2.2)
    disc(d, cx, cy, h, ef, er, 2.6, METAL, lift=base_lift + 2.4)
    # raised dome
    dome = P(cx, cy, h, ef, er, lift=base_lift + 4.0)
    disc_xy(d, dome[0], dome[1], 3.0*SCALE, 3.0*SQUASH*SCALE + 1.6, METAL, outline=OUTLINE)
    disc_xy(d, dome[0] - 0.8, dome[1] - 1.2, 1.4*SCALE, 1.4*SCALE, METAL_HI)
    # projector node tip glowing cyan, pulses brightness with the field
    pulse = [0, 1, 2, 1][frame]
    node = P(cx, cy, h, ef, er, lift=base_lift + 6.2 + pulse*0.4)
    nr = (1.8 + pulse*0.25)*SCALE
    disc_xy(d, node[0], node[1], nr + 1, nr + 1, OUTLINE)
    disc_xy(d, node[0], node[1], nr, nr, EN_CORE)
    disc_xy(d, node[0] - 0.4, node[1] - 0.4, nr*0.5, nr*0.5, EN_BRT)
    # mast connecting dome to node
    m0 = P(cx, cy, h, ef, er, lift=base_lift + 3.8)
    d.line([m0, node], fill=METAL, width=2)

    # ---- PULSING ENERGY FIELD (signature, translucent) ----
    # breathes over the 4 frames: small/dim -> large/bright -> contract
    grow = [0.0, 0.55, 1.0, 0.55][frame]
    # center of the field hovers over the emitter
    fcx, fcy = P(cx, cy, h, ef, er, lift=base_lift + 4.2)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    base_r = 13.5 + grow * 5.0
    rx = base_r * SCALE
    ry = (base_r * 0.78) * SCALE
    # outer soft dome fill
    a_fill = int(34 + grow * 30)
    od.ellipse([fcx-rx, fcy-ry, fcx+rx, fcy+ry], fill=(*EN_CORE, a_fill))
    # concentric ring shells (hex-dome read)
    for k, fr in enumerate((1.0, 0.74, 0.5)):
        rrx, rry = rx*fr, ry*fr
        a_ring = int(70 + grow * 80 - k*12)
        od.ellipse([fcx-rrx, fcy-rry, fcx+rrx, fcy+rry],
                   outline=(*EN_BRT, max(0, a_ring)), width=1)
    # hex strut lines from center to rim (the "hex/ring dome" structure)
    for ang in range(0, 360, 60):
        a = math.radians(ang + frame * 12)
        ex = fcx + math.cos(a) * rx
        ey = fcy + math.sin(a) * ry
        od.line([(fcx, fcy - ry*0.15), (ex, ey)], fill=(*EN_CORE, int(36 + grow*30)), width=1)
    # bright rim node sparks at the apex
    a_apex = int(120 + grow * 100)
    od.ellipse([fcx-2, fcy-ry-2, fcx+2, fcy-ry+2], fill=(*EN_BRT, a_apex))
    img_acc.alpha_composite(overlay)


if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    img_acc = img  # field overlays composite onto the same image
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_aegis(d, col*CELL_W + CELL_W//2, row*CELL_H + 90, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/aegis.png"
    img.save(out)
    print("wrote", out, img.size)
