#!/usr/bin/env python3
"""Kestrel Sentry idle sheet — feather-light quad-rotor recon drone.

AIRCRAFT sheet: tall 60x120 cells (360x480, unit.ts yOffset 60), hover bob.
Small silhouette on purpose — it should read as cheap and fragile next to the
fighters.

Silhouette cues:
  - X-frame with four rotor discs (blades step per frame)
  - centre pod with a sweeping radar dish (the "I'm a sensor" cue)
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
SCAN     = (150, 235, 170)   # radar-scan accent

STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62
LIFT   = 2
SCALE  = 1.35

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

POD = [(4.5, -3), (4.5, 3), (-4.5, 3), (-4.5, -3)]
HUBS = [(7.5, 7.5), (7.5, -7.5), (-7.5, 7.5), (-7.5, -7.5)]

def rotor(d, cx, cy, h, f, r, frame, moving, lift):
    ang = (frame * 40 if moving else frame * 12) + (35 if (f > 0) != (r > 0) else 0)
    a = math.radians(ang)
    br = 4.0
    # outline-only rotor arc (translucent fills would erase the arms beneath)
    x, y = P(cx, cy, h, f, r, lift)
    rx, ry = br*SCALE, br*SQUASH*SCALE
    d.ellipse([x-rx, y-ry, x+rx, y+ry], outline=(210, 210, 220), width=1)
    for k in (0, 90):
        aa = a + math.radians(k)
        df, dr = math.cos(aa)*br, math.sin(aa)*br
        line(d, cx, cy, h, (f + df, r + dr), (f - df, r - dr), METAL_HI, lift=lift, width=1)
    disc(d, cx, cy, h, f, r, 0.8, METAL, lift=lift, outline=OUTLINE)

def draw_kestrel(d, cx, cy, h, frame, moving):
    # soft ground shadow at tile level (roster air-unit convention)
    d.ellipse([cx - 10, cy + 14, cx + 10, cy + 21], fill=(3, 5, 3, 129))
    cy += [0, -1.4, 0, 1.4][frame] * 1.0     # light, jittery hover

    # X-frame arms out to the rotor hubs
    for hf, hr in HUBS:
        line(d, cx, cy, h, (0, 0), (hf, hr), OUTLINE, lift=1, width=4)
        line(d, cx, cy, h, (0, 0), (hf, hr), METAL, lift=1, width=2)

    # centre pod, extruded
    poly(d, cx, cy, h, POD, OUTLINE, lift=0)
    for i in range(LIFT + 1):
        poly(d, cx, cy, h, POD, HULL_LO if i == 0 else HULL, lift=i)
    poly(d, cx, cy, h, POD, BODY, lift=LIFT, outline=OUTLINE)
    poly(d, cx, cy, h, [(3.5, -1.8), (3.5, 1.8), (-3.5, 1.8), (-3.5, -1.8)], BODY_HI, lift=LIFT)

    # sensor eye at the nose
    disc(d, cx, cy, h, 3.8, 0, 1.0, UNDER, lift=LIFT - 0.5, outline=OUTLINE)
    disc(d, cx, cy, h, 3.9, -0.2, 0.4, SCAN, lift=LIFT - 0.5)

    # radar dish on a short mast, sweep line steps around per frame
    disc(d, cx, cy, h, -1, 0, 0.8, METAL, lift=LIFT + 1.4)
    disc(d, cx, cy, h, -1, 0, 3.2, METAL, lift=LIFT + 2.6, outline=OUTLINE)
    disc(d, cx, cy, h, -1, 0, 2.2, METAL_HI, lift=LIFT + 2.6)
    sweep = math.radians(frame * 90 + 20)
    sf, sr = math.cos(sweep)*2.8, math.sin(sweep)*2.8
    line(d, cx, cy, h, (-1, 0), (-1 + sf, sr), SCAN, lift=LIFT + 2.7, width=2)
    disc(d, cx, cy, h, -1, 0, 0.5, SCAN, lift=LIFT + 2.8)

    # rotors last (over the arms)
    for hf, hr in HUBS:
        rotor(d, cx, cy, h, hf, hr, frame, moving, lift=3)

if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            draw_kestrel(d, col*CELL_W + CELL_W//2, row*CELL_H + 90, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/kestrel-sentry.png"
    img.save(out)
    print("wrote", out, img.size)
