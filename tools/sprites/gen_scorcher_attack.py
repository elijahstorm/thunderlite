#!/usr/bin/env python3
"""Scorcher attack sheet: a big animated FLAME CONE bursting from the nozzle.

150px cells, 4 state columns (right/down/left/up, from facingToward) x 8 rows,
drawn with xOffset/yOffset 45 so the 150 cell is centred on the 60px tile (45px
of effect margin all round). The tank is drawn at the SAME scale as its idle
sheet (it must not grow); the star of the show is the fire jet that grows over
frames 0-4 and trails off over frames 5-7.

Reuses the idle generator so the vehicle stays identical.
"""
import math, os, sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_scorcher as G  # draw_scorcher, P, rot, palette, SCALE/SQUASH/LIFT
from lighting import relight

CELL = 150
COLS, ROWS = 4, 8
W, H = CELL * COLS, CELL * ROWS
HEADINGS = [90, 180, 270, 0]            # right, down, left, up

# muzzle origin in local (forward, right) coords, at flame height
MUZZLE_F = 14.0  # matches the shortened idle nozzle tip

# per-frame flame profile: (reach in local-forward px, half-width spread).
# grows to a wide roaring cone, then trails off to lingering puffs.
# Reach budget: the render window is exactly this unit's 150px cell, so the
# farthest tongue (MUZZLE_F 14 + reach * 1.18, * SCALE 1.66) must stay inside
# 75px of the cell centre or it leaks into the neighbouring state's frames.
# Max reach ≈ 24 keeps the tip at ~70px and still engulfs the adjacent tile.
FLAME = {
    0: (4,  4),
    1: (10, 7),
    2: (16, 11),
    3: (22, 14),
    4: (24, 15),
    5: (19, 13),
    6: (12, 11),
    7: (7,  8),
}
# small backward recoil shudder while firing the heavy projector
RECOIL = {1: 0.6, 2: 1.2, 3: 1.6, 4: 1.4, 5: 0.7}


def fpt(ox, oy, h, f, r, lift):
    return G.P(ox, oy, h, f, r, lift)


def billow_blob(d, ox, oy, h, f, r, rad, color, lift, jitter):
    """one rounded fire blob, squashed under the tilt; jitter wobbles its edge."""
    x, y = fpt(ox, oy, h, f, r, lift)
    rx = abs(rad) * G.SCALE
    ry = abs(rad) * G.SQUASH * G.SCALE
    y0, y1 = y - ry, y + ry + jitter
    if y1 < y0:
        y0, y1 = y1, y0
    d.ellipse([x - rx, y0, x + rx, y1], fill=color)


def flame_cone(d, ox, oy, h, frame, seed):
    reach, spread = FLAME[frame]
    if reach <= 0:
        return
    lift = G.LIFT + 1.4
    rng = __import__("random").Random(seed * 97 + frame * 13)

    # number of overlapping blobs scales with reach -> billowing body of fire
    n = max(4, int(reach / 3.2))
    # layered from outer (deep orange) inward to a yellow-white throat
    layers = [
        (FLAME_OUT := G.FLAME_D, 1.00, 1.00),
        (G.FLAME_B,              0.74, 0.62),
        (G.FLAME_Y,              0.42, 0.30),
    ]
    for color, wscale, lscale in layers:
        for i in range(n):
            t = i / (n - 1)
            # taper: narrow at the nozzle, fat in the middle, licking out at the tip
            shape = math.sin(t * math.pi) * 0.7 + t * 0.5
            f = MUZZLE_F + t * reach * lscale
            r = rng.uniform(-1, 1) * spread * shape * wscale
            rad = (1.6 + spread * 0.42 * shape) * wscale
            jit = rng.uniform(-1.2, 1.2) * G.SCALE
            billow_blob(d, ox, oy, h, f, r, rad, color, lift, jit)

    # licking flame tongues spiking out of the leading edge
    tipf = MUZZLE_F + reach * 0.92
    for _ in range(3):
        r = rng.uniform(-1, 1) * spread * 0.8
        ex = MUZZLE_F + reach * rng.uniform(0.95, 1.18)
        x0, y0 = fpt(ox, oy, h, tipf, r * 0.6, lift)
        x1, y1 = fpt(ox, oy, h, ex, r, lift)
        d.line([x0, y0, x1, y1], fill=G.FLAME_B, width=2)

    # bright hot throat right at the muzzle
    billow_blob(d, ox, oy, h, MUZZLE_F + 1.5, 0, 2.2 + spread * 0.10,
                G.FLAME_Y, lift, 0)
    billow_blob(d, ox, oy, h, MUZZLE_F + 1.0, 0, 1.2, (255, 255, 255), lift, 0)

    # heat smoke wisps for the trailing frames
    if frame >= 5:
        for _ in range(3):
            f = MUZZLE_F + reach * rng.uniform(0.5, 1.0)
            r = rng.uniform(-1, 1) * spread
            rad = rng.uniform(1.5, 3.0)
            g = rng.randint(70, 110)
            x, y = fpt(ox, oy, h, f, r, lift + rng.uniform(1, 4))
            rx, ry = rad * G.SCALE, rad * G.SQUASH * G.SCALE
            rx, ry = abs(rx), abs(ry)
            d.ellipse([x-rx, y-ry, x+rx, y+ry], fill=(g, g-6, g-12))


def draw_attack_cell(d, ox, oy, h, frame, seed):
    rec = RECOIL.get(frame, 0.0)
    bx, by = G.rot(-rec, 0, h)
    ox2 = ox + bx * G.SCALE
    oy2 = oy + by * G.SQUASH * G.SCALE
    # static body (no idle bob) so the flame reads as the motion
    G.draw_scorcher(d, ox2, oy2, h, 0, False)
    flame_cone(d, ox2, oy2, h, frame, seed=hash((h,)) & 0xffff)


if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # Each cell is drawn on its own 150px tile and composited in, so no flame can
    # ever bleed into a neighbouring state/frame cell (the in-game overlay shows
    # exactly one cell, and anything painted outside it pollutes other states).
    for row in range(ROWS):
        for col in range(COLS):
            tile = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            td = ImageDraw.Draw(tile)
            draw_attack_cell(td, CELL//2, CELL//2, HEADINGS[col], row, seed=col)
            img.alpha_composite(tile, (col*CELL, row*CELL))

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/attack/scorcher.png"
    img.save(out)
    print("wrote", out, img.size)
