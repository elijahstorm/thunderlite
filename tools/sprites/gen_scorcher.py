#!/usr/bin/env python3
"""Scorcher flame-tank idle sheet.

Same single-silhouette 2.5D technique as the Outrider:
  1. squash the whole top-down drawing vertically (SQUASH) to fake camera tilt
  2. extrude a solid dark side-wall under the deck (LIFT) so the hull has real
     thickness -> reads "from above-front".

The Scorcher is a squat, heavy, wide flame tank on fat treads (lower + broader
than the scorpion). Its defining features instead of a long cannon:
  - a short fat FLAME NOZZLE / projector poking off the front of the hull, with a
    constant pilot-flame flicker even at idle
  - armored fuel canisters strapped to the rear deck (the "I'm a flame unit" cue)

6 state columns (walk-right, walk-down, walk-left, walk-up, stand-right,
stand-left) x 4 animation rows, 60x60 cells => 360x240.
"""
import math
import sys, os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from lighting import relight

CELL, COLS, ROWS = 60, 6, 4
W, H = CELL * COLS, CELL * ROWS

# shared roster palette
OUTLINE  = (28, 29, 39)
BODY     = (233, 51, 46)     # deck top (red)
BODY_HI  = (255, 144, 133)   # spine highlight (pink)
HULL     = (170, 22, 44)     # side walls (dark red)
HULL_LO  = (120, 18, 40)     # deepest wall / shading
UNDER    = (102, 26, 94)     # purple under-detail
METAL    = (82, 75, 72)      # gunmetal
METAL_HI = (172, 164, 156)
WHITE    = (255, 255, 255)
# flame accent
FLAME_D  = (255, 120, 30)    # deep orange
FLAME_B  = (255, 180, 60)    # bright orange
FLAME_Y  = (255, 238, 170)   # yellow-white

# 6 columns: walk-right, walk-down, walk-left, walk-up, stand-right, stand-left.
# h=0 -> nose points screen-up(north); +90 -> nose screen-right(east).
STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62      # vertical compression = camera tilt
LIFT   = 5         # hull height (lower than scorpion -> squat)
SCALE  = 1.66      # fill the 60px cell, matching roster footprint

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

# wide, blunt, chunky hull footprint (forward, right). Broad and low.
HULL_PTS = [(11, -10), (11, 10), (-12, 10), (-12, -10)]
# slightly inset deck top
DECK_PTS = [(9.5, -8.5), (9.5, 8.5), (-10.5, 8.5), (-10.5, -8.5)]

def tread(d, cx, cy, h, side, frame, moving):
    """fat tread block running fore-aft along one side."""
    r0, r1 = (8.5, 12.5) if side > 0 else (-12.5, -8.5)
    # tread base shadow on the ground
    poly(d, cx, cy, h, [(13, r0), (13, r1), (-14, r1), (-14, r0)], OUTLINE, lift=0)
    # tread body wall
    for i in range(3):
        poly(d, cx, cy, h, [(12.5, r0), (12.5, r1), (-13.5, r1), (-13.5, r0)],
             METAL if i >= 1 else (52, 48, 46), lift=i)
    # tread top with rolling cleats (animate by sliding the cleat phase)
    poly(d, cx, cy, h, [(12.5, r0), (12.5, r1), (-13.5, r1), (-13.5, r0)],
         METAL, lift=3, outline=OUTLINE)
    rc = (r0 + r1) / 2
    phase = (frame * 1.6) if moving else 0.0
    f = 11.5 - (phase % 3.0)
    while f > -13.5:
        line(d, cx, cy, h, (f, r0 + 0.4), (f, r1 - 0.4), OUTLINE, lift=3)
        f -= 3.0
    line(d, cx, cy, h, (12, rc), (-13, rc), METAL_HI, lift=3)

def draw_scorcher(d, cx, cy, h, frame, moving):
    cy += [0, -1, 0, 1][frame] * 0.5     # subtle idle/drive bob

    # treads first (under the hull)
    tread(d, cx, cy, h, +1, frame, moving)
    tread(d, cx, cy, h, -1, frame, moving)

    # dark grounded footprint of the hull
    poly(d, cx, cy, h, HULL_PTS, OUTLINE, lift=0)
    # extrude side-wall up to the deck
    for i in range(LIFT + 1):
        shade = HULL_LO if i < LIFT * 0.5 else HULL
        poly(d, cx, cy, h, HULL_PTS, shade, lift=i)

    # front glacis bevel: a sloped, lighter plate low on the nose wall (brutish)
    poly(d, cx, cy, h, [(11, -9), (11, 9), (13.5, 6), (13.5, -6)], HULL, lift=1)
    line(d, cx, cy, h, (13.5, -6), (13.5, 6), OUTLINE, lift=1)

    # deck top + main silhouette outline
    poly(d, cx, cy, h, HULL_PTS, BODY, lift=LIFT, outline=OUTLINE)
    poly(d, cx, cy, h, DECK_PTS, BODY, lift=LIFT)
    # central raised spine highlight
    poly(d, cx, cy, h, [(8, -4), (8, 4), (-9, 4), (-9, -4)], BODY_HI, lift=LIFT)
    # rear deck shading
    poly(d, cx, cy, h, [(-6, -8.5), (-6, 8.5), (-10.5, 8.5), (-10.5, -8.5)],
         HULL, lift=LIFT)
    # armored deck seams
    line(d, cx, cy, h, (3, -8.5), (3, 8.5), HULL_LO, lift=LIFT)
    line(d, cx, cy, h, (-5, -8.5), (-5, 8.5), HULL_LO, lift=LIFT)
    # side rail highlights / shadow
    line(d, cx, cy, h, (9.5, -8.5), (-10.5, -8.5), BODY_HI, lift=LIFT)
    line(d, cx, cy, h, (9.5, 8.5), (-10.5, 8.5), HULL_LO, lift=LIFT)
    # corner rivets
    for rf, rr in [(9, -8), (9, 8), (-10, -8), (-10, 8)]:
        disc(d, cx, cy, h, rf, rr, 0.9, OUTLINE, lift=LIFT)

    # --- armored fuel canisters strapped to the rear deck (flame-unit cue) ---
    for cr in (-4.5, 4.5):
        # canister body (purple armored drum)
        poly(d, cx, cy, h, [(-3.5, cr-2.6), (-3.5, cr+2.6), (-9, cr+2.6), (-9, cr-2.6)],
             UNDER, lift=LIFT, outline=OUTLINE)
        # raised cylindrical top
        disc(d, cx, cy, h, -6.2, cr, 2.4, UNDER, lift=LIFT + 2.5, outline=OUTLINE)
        disc(d, cx, cy, h, -6.6, cr - 0.6, 1.0, (138, 54, 128), lift=LIFT + 2.5)
        # metal strap band
        line(d, cx, cy, h, (-4.0, cr-2.6), (-4.0, cr+2.6), METAL_HI, lift=LIFT + 1)
        line(d, cx, cy, h, (-8.5, cr-2.6), (-8.5, cr+2.6), METAL, lift=LIFT + 1)

    # --- short fat FLAME NOZZLE / projector off the front of the hull ---
    # mounting collar on the deck
    disc(d, cx, cy, h, 7, 0, 3.0, METAL, lift=LIFT, outline=OUTLINE)
    disc(d, cx, cy, h, 7, 0, 1.6, METAL_HI, lift=LIFT)
    # stubby wide barrel projecting forward (drawn as a thick capsule wall).
    # Kept short so it doesn't overhang the tile into the neighbouring sheet cell.
    for i in range(4):
        poly(d, cx, cy, h, [(8.5, -3.2), (8.5, 3.2), (12, 2.6), (12, -2.6)],
             METAL if i >= 2 else (60, 55, 53), lift=LIFT - 1 + i)
    poly(d, cx, cy, h, [(8.5, -3.2), (8.5, 3.2), (12, 2.6), (12, -2.6)],
         METAL, lift=LIFT + 2, outline=OUTLINE)
    line(d, cx, cy, h, (9, -2.4), (12, -1.9), METAL_HI, lift=LIFT + 2)
    # wide flared muzzle ring at the tip
    disc(d, cx, cy, h, 12.5, 0, 3.0, METAL, lift=LIFT + 0.8, outline=OUTLINE)
    disc(d, cx, cy, h, 12.5, 0, 2.0, OUTLINE, lift=LIFT + 0.8)
    disc(d, cx, cy, h, 12.5, 0, 1.2, HULL_LO, lift=LIFT + 0.8)

    # --- pilot-flame flicker at the muzzle, animates across the 4 frames ---
    flick = [0.0, 0.6, 0.3, 0.9][frame]
    fr = [0.0, 0.4, -0.3, 0.2][frame]
    base = (14.6 + flick, fr)
    # outer deep-orange tongue
    poly(d, cx, cy, h, [(13.5, fr-1.4), (13.5, fr+1.4),
                        (base[0]+0.8, fr+0.6), (base[0]+1.4, fr),
                        (base[0]+0.8, fr-0.6)],
         FLAME_D, lift=LIFT + 1.2)
    # bright core
    poly(d, cx, cy, h, [(13.8, fr-0.9), (13.8, fr+0.9),
                        (base[0]+0.3, fr)],
         FLAME_B, lift=LIFT + 1.2)
    # yellow-white hottest tip
    disc(d, cx, cy, h, 14.0, fr, 0.8, FLAME_Y, lift=LIFT + 1.2)

if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_scorcher(d, col*CELL + CELL//2, row*CELL + CELL//2 + 5, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/scorcher.png"
    img.save(out)
    print("wrote", out, img.size)
