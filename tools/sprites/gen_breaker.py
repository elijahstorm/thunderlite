#!/usr/bin/env python3
"""Breaker siege-gun idle sheet.

Same 2.5D recipe as gen_aegis.py: draw ONE coherent top-down silhouette, then
sell the downward camera tilt two ways -- squash the whole drawing vertically
(SQUASH) for the camera pitch, and extrude a solid dark side-wall under the deck
(LIFT) for real thickness.

The Breaker is a heavy anti-fortification siege piece on a broad tracked chassis
(warmachine / aegis class). Where the Aegis mounts a shield dome, the Breaker
carries a long ELEVATED SIEGE GUN: a brass-banded barrel raised on a cradle and
angled up to arc its shells over cover. Its idle tell is a slow amber charge
light blinking at the breech sight.

6 state columns x 4 animation rows, 60x120 cells => 360x480. The raised barrel
climbs into the overflow tile, so unit.ts uses yOffset 60.
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
BODY     = (233, 51, 46)     # deck top / red armor
BODY_HI  = (255, 144, 133)   # pink highlight
HULL     = (170, 22, 44)     # dark-red side walls
HULL_LO  = (120, 18, 40)     # deepest wall / shading
UNDER    = (102, 26, 94)     # purple under-cage / gun cradle
METAL    = (82, 75, 72)      # gunmetal (treads, barrel)
METAL_HI = (172, 164, 156)
WHITE    = (255, 255, 255)
# brass gun accents (siege-artillery identity)
BRASS    = (150, 108, 52)
BRASS_HI = (214, 170, 96)
# amber charge light
AMBER    = (255, 176, 74)
AMBER_HI = (255, 224, 168)

# 6 columns: walk-right, walk-down, walk-left, walk-up, stand-right, stand-left.
# h=0 -> nose points screen-up(north/away); +90 -> nose screen-right(east).
STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62
LIFT   = 5          # tanky chassis kept low so its base reads as grounded
SCALE  = 1.56       # broad heavy footprint fills the cell
TREAD_LIFT = 1.6

# siege gun geometry, shared with gen_breaker_attack.py (muzzle blast origin)
BREECH_F, BREECH_LIFT = -4.0, LIFT + 2.6   # breech pivot, rear + low
MUZZLE_F, MUZZLE_LIFT = 15.0, LIFT + 7.4   # muzzle tip, forward + raised


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


# tread footprints sit just outside the hull on the left/right flanks
def tread(d, cx, cy, h, side):
    r0 = 9.5 * side
    quad = [(12, r0 - 2.4), (12, r0 + 2.4), (-13, r0 + 2.4), (-13, r0 - 2.4)]
    poly(d, cx, cy, h, quad, OUTLINE, lift=0)
    for i in range(int(TREAD_LIFT*2) + 1):
        poly(d, cx, cy, h, quad, METAL, lift=i*0.5)
    poly(d, cx, cy, h, quad, METAL, lift=TREAD_LIFT, outline=OUTLINE)
    for f in range(-11, 12, 3):
        line(d, cx, cy, h, (f, r0 - 2.2), (f, r0 + 2.2), OUTLINE, lift=TREAD_LIFT)
    line(d, cx, cy, h, (11, r0 - 2.2), (-12, r0 - 2.2), METAL_HI, lift=TREAD_LIFT)


# broad armored top-down footprint (forward, right): blunt nose, very wide body
BODY_PTS = [(13, -8), (13, 8), (-13, 9), (-15, 0), (-13, -9)]
DECK_PTS = [(11, -7), (11, 7), (-11, 8), (-13, 0), (-11, -8)]


def draw_breaker(d, cx, cy, h, frame, moving):
    cy += [0, -1, 0, 1][frame] if moving else [0, -1, 0, -1][frame] * 0.5

    # treads first (drawn under the body), both flanks
    tread(d, cx, cy, h, -1)
    tread(d, cx, cy, h, +1)

    # dark grounded base, then extrude the side-wall up to the deck
    poly(d, cx, cy, h, BODY_PTS, OUTLINE, lift=0)
    for i in range(LIFT + 1):
        shade = HULL_LO if i < LIFT * 0.5 else HULL
        poly(d, cx, cy, h, BODY_PTS, shade, lift=i)

    # front armor lip / bumper low on the nose wall
    poly(d, cx, cy, h, [(14, -7), (14, 7), (12.5, 7), (12.5, -7)], HULL_LO, lift=1.6)

    # deck top + main silhouette outline
    poly(d, cx, cy, h, BODY_PTS, BODY, lift=LIFT, outline=OUTLINE)
    poly(d, cx, cy, h, DECK_PTS, BODY, lift=LIFT)
    poly(d, cx, cy, h, [(10, -6), (10, 4), (-8, 5), (-9, -6)], BODY_HI, lift=LIFT)
    poly(d, cx, cy, h, [(-7, -7), (-13, 0), (-7, 8), (-4, 0)], HULL, lift=LIFT)

    for sf in (6.0, 0.0, -6.0):
        line(d, cx, cy, h, (sf, -7), (sf, 7.5), HULL_LO, lift=LIFT)
    line(d, cx, cy, h, (12, -7), (-12, -8.5), BODY_HI, lift=LIFT)
    line(d, cx, cy, h, (12, 7), (-12, 8.5), HULL_LO, lift=LIFT)
    for rf, rr in [(11, -7), (11, 7), (-11, -7.5), (-11, 7.5)]:
        disc(d, cx, cy, h, rf, rr, 0.9, OUTLINE, lift=LIFT)

    # ---- gun mount cradle (where a turret would sit) ----
    poly(d, cx, cy, h, [(3, -5), (3, 5), (-7, 6), (-7, -6)], UNDER, lift=LIFT, outline=OUTLINE)
    for i in range(3):
        poly(d, cx, cy, h, [(2.5, -4.5), (2.5, 4.5), (-6, 5), (-6, -5)], METAL, lift=LIFT + i*0.8)
    poly(d, cx, cy, h, [(2.5, -4.5), (2.5, 4.5), (-6, 5), (-6, -5)], METAL,
         lift=LIFT + 2.4, outline=OUTLINE)
    disc(d, cx, cy, h, -1.5, -4.6, 1.0, BRASS_HI, lift=LIFT + 2.4)
    disc(d, cx, cy, h, -1.5, 4.6, 1.0, BRASS, lift=LIFT + 2.4)

    # ---- siege barrel: breech (rear, low) -> muzzle (front, raised) ----
    bf, blift = BREECH_F, BREECH_LIFT
    mf, mlift = MUZZLE_F, MUZZLE_LIFT
    steps = 18

    def along(k):
        t = k / steps
        return (bf + (mf - bf) * t, blift + (mlift - blift) * t, 3.2 - 0.9 * t)

    # dark grounded silhouette pass, then the metal body, then a top highlight rail
    for k in range(steps + 1):
        f, lift, rad = along(k)
        disc(d, cx, cy, h, f, 0, rad + 0.6, OUTLINE, lift=lift)
    for k in range(steps + 1):
        f, lift, rad = along(k)
        disc(d, cx, cy, h, f, 0, rad, METAL, lift=lift)
    for k in range(steps + 1):
        f, lift, rad = along(k)
        disc(d, cx, cy, h, f, 0, rad * 0.35, METAL_HI, lift=lift + rad * 0.45)

    # brass reinforcement bands wrapping the barrel
    for t in (0.12, 0.34, 0.56):
        f = bf + (mf - bf) * t
        lift = blift + (mlift - blift) * t
        rad = 3.2 - 0.9 * t
        disc(d, cx, cy, h, f, 0, rad + 0.5, OUTLINE, lift=lift)
        disc(d, cx, cy, h, f, 0, rad + 0.2, BRASS, lift=lift)
        disc(d, cx, cy, h, f, 0, (rad + 0.2) * 0.55, BRASS_HI, lift=lift)

    # heavy breech block at the very rear
    disc(d, cx, cy, h, bf - 0.5, 0, 3.6, OUTLINE, lift=blift)
    disc(d, cx, cy, h, bf - 0.5, 0, 3.0, METAL, lift=blift)
    disc(d, cx, cy, h, bf - 0.5, 0, 1.6, BRASS, lift=blift)

    # flared muzzle + dark bore
    disc(d, cx, cy, h, mf, 0, 2.9, OUTLINE, lift=mlift)
    disc(d, cx, cy, h, mf, 0, 2.4, BRASS, lift=mlift)
    disc(d, cx, cy, h, mf, 0, 1.5, BRASS_HI, lift=mlift)
    disc(d, cx, cy, h, mf + 0.3, 0, 1.0, OUTLINE, lift=mlift)

    # ---- amber charge light on the breech sight (idle pulse) ----
    glow = [0.4, 1.0, 0.7, 1.0][frame]
    lr = 1.1 + glow * 0.7
    disc(d, cx, cy, h, bf + 0.5, -3.0, lr + 0.5, OUTLINE, lift=blift + 2.6)
    disc(d, cx, cy, h, bf + 0.5, -3.0, lr, AMBER, lift=blift + 2.6)
    disc(d, cx, cy, h, bf + 0.5, -3.0, lr * 0.5, AMBER_HI, lift=blift + 2.6)


if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_breaker(d, col*CELL_W + CELL_W//2, row*CELL_H + 90, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/breaker.png"
    img.save(out)
    print("wrote", out, img.size)
