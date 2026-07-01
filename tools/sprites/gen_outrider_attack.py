#!/usr/bin/env python3
"""Outrider attack sheet: a mounted-gun burst.

Attack overlays in thunderlite are 150px cells, 4 state columns (right/down/left/
up, from facingToward) x N animation rows, drawn with xOffset/yOffset 45 so the
150 cell is centred on the 60px tile (45px of effect margin all round). The buggy
is drawn at the SAME scale as its idle sheet (it must not grow), then we add a
muzzle flash at the nose and a short recoil kick.

Reuses the idle generator's drawing code so the vehicle stays identical.
"""
import math, os, sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_outrider as G  # draw_buggy, P, rot, palette, SCALE/SQUASH/LIFT

CELL = 150
COLS, ROWS = 4, 8                       # 4 facings, 8 animation frames
W, H = CELL * COLS, CELL * ROWS
HEADINGS = [90, 180, 270, 0]            # right, down, left, up (state order)

# per-frame gun timing: build-up, two flash frames, then settle
RECOIL = {2: 3.0, 3: 2.0, 4: 1.0}
FLASH  = {2: 7.0, 3: 5.0, 4: 2.5}

def muzzle_flash(d, ox, oy, h, size):
    if size <= 0:
        return
    cx, cy = G.P(ox, oy, h, 16.5, 0, lift=3.0)
    # radiating spikes
    for ang in range(0, 360, 45):
        a = math.radians(ang)
        d.line([cx, cy, cx + math.cos(a)*size, cy + math.sin(a)*size*G.SQUASH],
               fill=(255, 232, 150), width=1)
    d.ellipse([cx-size*0.7, cy-size*0.7*G.SQUASH, cx+size*0.7, cy+size*0.7*G.SQUASH],
              fill=(255, 232, 150))
    d.ellipse([cx-size*0.4, cy-size*0.4*G.SQUASH, cx+size*0.4, cy+size*0.4*G.SQUASH],
              fill=(255, 255, 255))

def draw_attack_cell(d, ox, oy, h, frame):
    # recoil shifts the whole buggy backward (opposite the nose) for a few frames
    rec = RECOIL.get(frame, 0.0)
    bx, by = G.rot(-rec, 0, h)
    ox2 = ox + bx*G.SCALE
    oy2 = oy + by*G.SQUASH*G.SCALE
    # keep the body static (no idle bob / dust) so the recoil + flash read clearly
    G.draw_buggy(d, ox2, oy2, h, 0, False)
    muzzle_flash(d, ox2, oy2, h, FLASH.get(frame, 0.0))

img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
for row in range(ROWS):
    for col in range(COLS):
        draw_attack_cell(d, col*CELL + CELL//2, row*CELL + CELL//2, HEADINGS[col], row)

out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/attack/outrider.png"
img.save(out)
print("wrote", out, img.size)
