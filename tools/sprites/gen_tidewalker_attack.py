#!/usr/bin/env python3
"""Tidewalker attack sheet: front-gun burst with recoil.

150px cells, 4 state columns (right/down/left/up from facingToward) x 8 rows,
drawn with xOffset/yOffset 45 so the 150 cell is centred on the 60px tile. The
hovercraft is drawn at the SAME scale as its idle sheet (it must not grow); we
add a muzzle flash at the front gun + a short backward recoil kick. The foam
spray still shows (it always floats).

Reuses the idle generator so the vehicle stays identical.
"""
import math, os, sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_tidewalker as G  # draw_hover, P, rot, palette, SCALE/SQUASH/LIFT
from lighting import relight

CELL = 150
COLS, ROWS = 4, 8
W, H = CELL * COLS, CELL * ROWS
HEADINGS = [90, 180, 270, 0]   # right, down, left, up

# per-frame gun timing: build-up, two big flash frames, then settle/smoke
RECOIL = {2: 3.0, 3: 2.2, 4: 1.0}
FLASH  = {2: 8.0, 3: 6.0, 4: 3.0}
SMOKE  = {4: 0.6, 5: 1.0, 6: 0.8, 7: 0.4}

def muzzle_flash(d, ox, oy, h, size):
    if size <= 0:
        return
    deck = G.LIFT + 2.6
    cx, cy = G.P(ox, oy, h, 13.5, 0, lift=deck + 1.0)
    for ang in range(0, 360, 45):
        a = math.radians(ang)
        d.line([cx, cy, cx + math.cos(a)*size, cy + math.sin(a)*size*G.SQUASH],
               fill=(255, 232, 150), width=1)
    d.ellipse([cx-size*0.7, cy-size*0.7*G.SQUASH, cx+size*0.7, cy+size*0.7*G.SQUASH],
              fill=(255, 232, 150))
    d.ellipse([cx-size*0.4, cy-size*0.4*G.SQUASH, cx+size*0.4, cy+size*0.4*G.SQUASH],
              fill=(255, 255, 255))

def smoke(d, ox, oy, h, t):
    if t <= 0:
        return
    deck = G.LIFT + 2.6
    for i, (f, spread, tone) in enumerate([(15, 2.0, 150), (18, 2.6, 175),
                                            (21.5, 2.0, 200)]):
        x, y = G.P(ox, oy, h, f, 0, lift=deck + 1.0 + i*1.2)
        rad = spread * t * G.SCALE
        d.ellipse([x-rad, y-rad*G.SQUASH, x+rad, y+rad*G.SQUASH],
                  fill=(tone, tone, tone+4))

def draw_attack_cell(d, ox, oy, h, frame):
    rec = RECOIL.get(frame, 0.0)
    bx, by = G.rot(-rec, 0, h)
    ox2 = ox + bx*G.SCALE
    oy2 = oy + by*G.SQUASH*G.SCALE
    # keep it floating (moving=True so spray + fan blur show) but no bob drift:
    # use frame 0 for a stable body, the recoil supplies the motion.
    G.draw_hover(d, ox2, oy2, h, 0, True)
    smoke(d, ox2, oy2, h, SMOKE.get(frame, 0.0))
    muzzle_flash(d, ox2, oy2, h, FLASH.get(frame, 0.0))

img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
for row in range(ROWS):
    for col in range(COLS):
        draw_attack_cell(d, col*CELL + CELL//2, row*CELL + CELL//2, HEADINGS[col], row)

relight(img)
out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/attack/tidewalker.png"
img.save(out)
print("wrote", out, img.size)
