#!/usr/bin/env python3
"""Tidewalker amphibious hovercraft idle sheet.

Same single-silhouette 2.5D technique as gen_outrider.py:
  1. SQUASH the whole top-down drawing vertically to fake the camera tilt.
  2. extrude a dark side-wall under the deck (LIFT) so the body has thickness.

The Tidewalker reads as a HOVERCRAFT, not a tank or a boat:
  - a rounded wide armored hull (red, roster palette) sitting on a fat inflated
    rubber air-cushion SKIRT ring (dark purple/gunmetal lobed ring) around the base
  - a big rear DUCTED FAN (circular housing + spinning blades, blurred per frame)
  - a low cockpit + small front gun mount
  - a pale water-foam SPRAY ripple ring kicking out from under the skirt on every
    frame (it always floats), stronger on the walk frames. That "floating on a
    cushion of spray" read is its identity.

6 state columns x 4 animation rows, 60x60 cells => 360x240.
"""
import math
import sys, os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from lighting import relight

CELL, COLS, ROWS = 60, 6, 4
W, H = CELL * COLS, CELL * ROWS

# shared roster palette (scorpion / stealth tank)
OUTLINE  = (28, 29, 39)
BODY     = (233, 51, 46)     # deck top
BODY_HI  = (255, 144, 133)   # spine highlight
HULL     = (170, 22, 44)     # side walls / shading
HULL_LO  = (120, 18, 40)     # deepest wall
UNDER    = (102, 26, 94)     # skirt rubber purple
UNDER_HI = (140, 60, 130)    # skirt lobe highlight
METAL    = (82, 75, 72)      # gunmetal (fan housing, gun)
METAL_HI = (172, 164, 156)
WHITE    = (245, 248, 252)
# the one accent: pale water-foam blue-white spray
FOAM     = (210, 236, 246)
FOAM_HI  = (240, 250, 255)
FOAM_LO  = (170, 210, 230)

# 6 columns: walk-right, walk-down, walk-left, walk-up, stand-right, stand-left.
# h=0 -> nose screen-up (north/away); +90 -> nose screen-right (east).
STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62
LIFT   = 6
SCALE  = 1.66

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

def ring(d, cx, cy, h, f, r, rad, fill, lift=0.0, width=1):
    """thin elliptical ring on the ground (foam ripple)."""
    x, y = P(cx, cy, h, f, r, lift)
    rx, ry = rad*SCALE, rad*SQUASH*SCALE
    d.ellipse([x-rx, y-ry, x+rx, y+ry], outline=fill, width=width)

# rounded wide hull footprint (forward, right) - blunt nose, wide rounded tail
BODY_PTS = [
    (12, 0), (11, -5.5), (8.5, -8.5), (-5, -9.5), (-9.5, -8),
    (-11, 0), (-9.5, 8), (-5, 9.5), (8.5, 8.5), (11, 5.5),
]
DECK_PTS = [
    (9.5, 0), (8.5, -4.5), (6.5, -6.5), (-5, -7), (-8, -5.5),
    (-9, 0), (-8, 5.5), (-5, 7), (6.5, 6.5), (8.5, 4.5),
]

def draw_skirt(d, cx, cy, h, frame):
    """fat inflated rubber air-cushion ring around the whole base."""
    # the skirt is a ring of overlapping lobes (the inflated rubber segments)
    lobes = [
        (12.5, 0), (10, -8.5), (1, -11.5), (-9, -10.5), (-13, 0),
        (-9, 10.5), (1, 11.5), (10, 8.5),
    ]
    # dark base shadow of the whole skirt footprint first
    skirt_ring = [
        (13.5, 0), (11, -9), (1, -12.5), (-10, -11.5), (-14, 0),
        (-10, 11.5), (1, 12.5), (11, 9),
    ]
    poly(d, cx, cy, h, skirt_ring, OUTLINE, lift=0.5)
    poly(d, cx, cy, h, skirt_ring, UNDER, lift=1.6)
    # individual inflated lobes give the segmented-rubber read
    for lf, lr in lobes:
        disc(d, cx, cy, h, lf, lr, 2.6, UNDER, lift=2.2, outline=OUTLINE)
        # top-right lit edge of each lobe
        disc(d, cx, cy, h, lf + 0.6, lr - 0.6, 1.1, UNDER_HI, lift=2.6)

def draw_fan(d, cx, cy, h, frame, moving):
    """rear ducted fan: circular housing + blurred spinning blades."""
    fx, fr = -9.5, 0      # mounted at the rear, slightly raised
    flift = LIFT + 0.5
    # housing ring
    disc(d, cx, cy, h, fx, fr, 5.0, OUTLINE, lift=flift)
    disc(d, cx, cy, h, fx, fr, 4.5, METAL, lift=flift)
    disc(d, cx, cy, h, fx, fr, 4.0, OUTLINE, lift=flift)
    disc(d, cx, cy, h, fx, fr, 3.6, (40, 40, 48), lift=flift)  # dark intake throat
    # spinning blades: rotate per frame; smear them when moving (motion blur)
    base = frame * (math.pi / 4 if moving else math.pi / 2)
    n_blades = 6
    cxp, cyp = P(cx, cy, h, fx, fr, flift)
    rad = 3.4 * SCALE
    blade_col = METAL_HI if not moving else (120, 114, 110)
    for i in range(n_blades):
        ang = base + i * (2*math.pi / n_blades)
        # blade is a thin spoke from hub to rim
        x2 = cxp + math.cos(ang) * rad
        y2 = cyp + math.sin(ang) * rad * SQUASH
        d.line([cxp, cyp, x2, y2], fill=blade_col, width=2 if moving else 1)
    if moving:
        # blur arc smear ring to read "spinning fast"
        d.ellipse([cxp-rad, cyp-rad*SQUASH, cxp+rad, cyp+rad*SQUASH],
                  outline=(150, 144, 140), width=1)
    # hub cap with a glint
    disc(d, cx, cy, h, fx, fr, 1.2, METAL_HI, lift=flift, outline=OUTLINE)
    disc(d, cx, cy, h, fx - 0.3, fr - 0.3, 0.4, WHITE, lift=flift)
    # twin tail rudder fins over the duct
    line(d, cx, cy, h, (-9.5, -2.0), (-12.5, -2.0), METAL, lift=flift + 4)
    line(d, cx, cy, h, (-9.5, 2.0), (-12.5, 2.0), METAL, lift=flift + 4)

def draw_spray(d, cx, cy, h, frame, moving):
    """pale water-foam ripple kicking out from under the skirt (always floating)."""
    jit = [0.0, 0.4, -0.3, 0.2][frame]
    # concentric foam ripple rings around the whole craft, on the ground
    base_r = 14.5
    if moving:
        rings = [(base_r, FOAM_LO, 1), (base_r + 2.2 + jit, FOAM, 1)]
    else:
        rings = [(base_r, FOAM_LO, 1)]
    for rr, col, wdt in rings:
        ring(d, cx, cy, h, 0, 0, rr, col, lift=0.3, width=wdt)
    # foam puff dabs around the perimeter; thicker / kicked back when moving
    if moving:
        dabs = [
            (13, -10, 1.8), (13, 10, 1.8), (-13, -10, 2.4), (-13, 10, 2.4),
            (-15, 0, 2.6), (2, -13, 1.6), (2, 13, 1.6), (14, 0, 1.5),
        ]
    else:
        dabs = [
            (12, -10, 1.2), (12, 10, 1.2), (-12, -10, 1.4), (-12, 10, 1.4),
            (-13, 0, 1.4), (13, 0, 1.0),
        ]
    for f, r, rad in dabs:
        ff = f + (jit if f < 0 else 0)
        disc(d, cx, cy, h, ff, r, rad, FOAM, lift=0.4)
        disc(d, cx, cy, h, ff + 0.4, r - 0.3, rad*0.5, FOAM_HI, lift=0.5)

def draw_hover(d, cx, cy, h, frame, moving):
    cy += [0, -1, 0, -1][frame]  # gentle hover bob (always floats)

    draw_spray(d, cx, cy, h, frame, moving)
    draw_skirt(d, cx, cy, h, frame)

    # dark base footprint (grounded outline of the hull)
    poly(d, cx, cy, h, BODY_PTS, OUTLINE, lift=2.2)
    # extrude the hull side-wall up from the skirt top to the deck
    for i in range(LIFT + 1):
        shade = HULL_LO if i < LIFT * 0.45 else HULL
        poly(d, cx, cy, h, BODY_PTS, shade, lift=2.6 + i)

    deck = LIFT + 2.6
    # deck top + main silhouette outline
    poly(d, cx, cy, h, BODY_PTS, BODY, lift=deck, outline=OUTLINE)
    poly(d, cx, cy, h, DECK_PTS, BODY, lift=deck)
    # spine highlight
    poly(d, cx, cy, h, [(8, 0), (6, -3), (-6, -3), (-7, 0), (-6, 3), (6, 3)],
         BODY_HI, lift=deck)
    # rear shading where the fan sits
    poly(d, cx, cy, h, [(-4, -6), (-9, -4), (-9, 4), (-4, 6), (-3, 0)],
         HULL, lift=deck)
    # side rails
    line(d, cx, cy, h, (9, -6.5), (-7, -6.5), BODY_HI, lift=deck)
    line(d, cx, cy, h, (9, 6.5), (-7, 6.5), HULL_LO, lift=deck)
    # panel seams
    line(d, cx, cy, h, (2.5, -6), (2.5, 6), HULL_LO, lift=deck)
    line(d, cx, cy, h, (-2.5, -6), (-2.5, 6), HULL_LO, lift=deck)

    # low cockpit canopy toward the front (dark glass, set into the deck)
    poly(d, cx, cy, h, [(7.5, -3.5), (4, -4), (4, 4), (7.5, 3.5)], OUTLINE,
         lift=deck + 1.2)
    poly(d, cx, cy, h, [(7.0, -3), (4.5, -3.3), (4.5, 3.3), (7.0, 3)],
         (60, 90, 110), lift=deck + 1.4)
    disc(d, cx, cy, h, 6.2, -1.2, 0.9, (150, 200, 220), lift=deck + 1.6)

    # small front gun mount on a low turret base
    disc(d, cx, cy, h, 7.5, 0, 2.4, UNDER, lift=deck + 0.6, outline=OUTLINE)
    disc(d, cx, cy, h, 7.5, 0, 1.4, METAL, lift=deck + 1.2)
    # gun barrel pointing forward (nose)
    poly(d, cx, cy, h, [(8, -0.8), (12.5, -0.6), (12.5, 0.6), (8, 0.8)],
         METAL, lift=deck + 1.0, outline=OUTLINE)
    disc(d, cx, cy, h, 12.5, 0, 0.7, OUTLINE, lift=deck + 1.0)

    draw_fan(d, cx, cy, h, frame, moving)

    # corner rivets on the deck
    for rf, rr in [(8.5, -6), (8.5, 6), (-6.5, -6), (-6.5, 6)]:
        disc(d, cx, cy, h, rf, rr, 0.7, OUTLINE, lift=deck)

if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_hover(d, col*CELL + CELL//2, row*CELL + CELL//2 + 4, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/tidewalker.png"
    img.save(out)
    print("wrote", out, img.size)
