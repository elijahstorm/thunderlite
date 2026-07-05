#!/usr/bin/env python3
"""Shrike Interdictor attack sheet — a MISSILE launched from the wing rail.

150px cells, 4 state columns (right/down/left/up) x 8 rows, xOffset/yOffset 45.
Reuses the idle generator so the airframe stays pixel-identical; a bright-tipped
missile streaks forward over frames 0-4 trailing an amber smoke plume, then the
plume dissipates 5-7.
"""
import math, os, sys, random
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_shrike_interdictor as G
from lighting import relight

CELL = 150
COLS, ROWS = 4, 8
W, H = CELL * COLS, CELL * ROWS
HEADINGS = [90, 180, 270, 0]

NOSE_F = 13.5

# per-frame missile profile: (tip position forward in local px, plume length).
# Reach budget: the render window is exactly this unit's 150px cell, so the tip
# (NOSE_F 13.5 + tip, * SCALE 1.5, + bloom) must stay inside 75px of the cell
# centre or it leaks into the neighbouring state's frames.
SHOT = {
    0: (2, 3),
    1: (10, 8),
    2: (19, 12),
    3: (27, 14),
    4: (30, 12),
    5: (0, 9),
    6: (0, 5),
    7: (0, 2),
}
RECOIL = {1: 0.5, 2: 1.0, 3: 1.3, 4: 0.9, 5: 0.4}


def plume(d, ox, oy, h, frame, seed):
    _, plen = SHOT[frame]
    if plen <= 0:
        return
    rng = random.Random(seed * 149 + frame * 19)
    lift = G.LIFT + 1.0
    # amber smoke trail puffing back from the rail toward the tail
    start = NOSE_F - 2
    for i in range(int(plen)):
        t = i / max(1, plen)
        f = start - i * 1.4
        r = rng.uniform(-1, 1) * (0.6 + t * 2.2)
        rad = 0.8 + t * 2.4
        col = G.AMBER_B if i < plen * 0.4 else G.AMBER_D
        G.disc(d, ox, oy, h, f, r, rad, col, lift=lift)


def missile(d, ox, oy, h, frame, seed):
    tip, _ = SHOT[frame]
    if tip <= 0:
        return
    lift = G.LIFT + 1.2
    # a short bright dart with a white-hot warhead tip and amber exhaust
    body_f = NOSE_F + tip
    G.poly(d, ox, oy, h,
           [(body_f, -0.9), (body_f + 1.6, 0), (body_f, 0.9),
            (body_f - 3.5, 0.9), (body_f - 3.5, -0.9)],
           G.METAL_HI, lift=lift, outline=G.OUTLINE)
    G.disc(d, ox, oy, h, body_f + 0.6, 0, 0.9, G.AMBER_W, lift=lift)   # warhead flash
    # exhaust flare off the missile tail
    G.poly(d, ox, oy, h,
           [(body_f - 3.5, -0.8), (body_f - 3.5, 0.8), (body_f - 6.0, 0)],
           G.AMBER_B, lift=lift)

    # muzzle flash at the launch rail on the ignition frames
    if frame in (1, 2):
        mx, my = G.P(ox, oy, h, NOSE_F - 2, 0, lift)
        d.ellipse([mx - 3, my - 2, mx + 3, my + 2], fill=G.AMBER_B)
        d.ellipse([mx - 1.5, my - 1, mx + 1.5, my + 1], fill=G.AMBER_W)

    # impact bloom at the tip on the peak frames
    if frame in (3, 4):
        fx, fy = G.P(ox, oy, h, body_f + 1.6, 0, lift)
        rad = 4 + (frame == 3) * 2
        d.ellipse([fx - rad, fy - rad * G.SQUASH, fx + rad, fy + rad * G.SQUASH],
                  fill=G.AMBER_B)
        d.ellipse([fx - rad * 0.5, fy - rad * 0.5 * G.SQUASH,
                   fx + rad * 0.5, fy + rad * 0.5 * G.SQUASH], fill=G.AMBER_W)


def draw_attack_cell(d, ox, oy, h, frame, seed):
    rec = RECOIL.get(frame, 0.0)
    bx, by = G.rot(-rec, 0, h)
    ox2 = ox + bx * G.SCALE
    oy2 = oy + by * G.SQUASH * G.SCALE
    G.draw_shrike(d, ox2, oy2, h, 0, False)
    plume(d, ox2, oy2, h, frame, seed)
    missile(d, ox2, oy2, h, frame, seed)


if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # Each cell is drawn on its own 150px tile and composited in, so no missile
    # or plume can ever bleed into a neighbouring state/frame cell (the in-game
    # overlay shows exactly one cell, and anything outside it pollutes others).
    for row in range(ROWS):
        for col in range(COLS):
            tile = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            td = ImageDraw.Draw(tile)
            draw_attack_cell(td, CELL//2, 73, HEADINGS[col], row, seed=col)
            img.alpha_composite(tile, (col*CELL, row*CELL))

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/attack/shrike-interdictor.png"
    img.save(out)
    print("wrote", out, img.size)
