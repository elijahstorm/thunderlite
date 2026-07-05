#!/usr/bin/env python3
"""Breaker attack sheet: a heavy siege-gun MUZZLE BLAST + recoil kick.

150px cells, 4 state columns (right/down/left/up, from facingToward) x 8 rows,
drawn with xOffset/yOffset 45 so the 150 cell is centred on the 60px tile. Reuses
the idle generator so the chassis stays identical; the star of the show is the
concussion blast -- a white-hot star flash punching out of the muzzle over frames
1-4 while the barrel/chassis slams back on its cradle (recoil), then a rolling
smoke cloud that billows and drifts off over frames 3-7, with a bright shell
streak arcing out of the bore.
"""
import math, os, sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_breaker as G  # draw_breaker, P, rot, palette, SCALE/SQUASH/LIFT, muzzle geom
from lighting import relight

CELL = 150
COLS, ROWS = 4, 8
W, H = CELL * COLS, CELL * ROWS
HEADINGS = [90, 180, 270, 0]            # right, down, left, up

# per-frame blast profile: (flash radius, shell reach beyond muzzle, smoke radius).
# Reach budget: farthest streak sits at MUZZLE_F 15 + reach 22 ≈ 37 local-forward,
# * SCALE 1.56 ≈ 58px from the cell centre — inside the 75px half-cell so it never
# leaks into a neighbouring state's frames.
BLAST = {
    0: (0.0,  0.0,  0.0),
    1: (7.5,  3.0,  2.0),
    2: (5.0,  9.0,  5.0),
    3: (2.6, 16.0,  8.0),
    4: (1.2, 22.0,  9.5),
    5: (0.0,  0.0, 10.0),
    6: (0.0,  0.0,  9.0),
    7: (0.0,  0.0,  6.5),
}
# heavy recoil: the whole piece slams back, then rides forward to rest
RECOIL = {1: 3.2, 2: 2.4, 3: 1.4, 4: 0.6}

FLASH_OUT  = (255, 176, 74)
FLASH_MID  = (255, 224, 150)
FLASH_CORE = (255, 255, 255)


def _blob(d, x, y, rad, color):
    rx = abs(rad)
    ry = abs(rad) * G.SQUASH
    d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=color)


def draw_blast(d, ox, oy, h, frame, seed):
    flash, reach, smoke = BLAST[frame]
    rng = __import__("random").Random(seed * 131 + frame * 17)
    mx, my = G.P(ox, oy, h, G.MUZZLE_F, 0, G.MUZZLE_LIFT)

    # rolling smoke cloud first, behind the flash (translucent -> survives relight)
    if smoke > 0:
        n = max(3, int(smoke))
        for _ in range(n):
            f = G.MUZZLE_F + rng.uniform(-1, 1) * smoke * 0.6
            r = rng.uniform(-1, 1) * smoke * 0.7
            lift = G.MUZZLE_LIFT + rng.uniform(0, smoke) * 0.6
            x, y = G.P(ox, oy, h, f, r, lift)
            rad = rng.uniform(smoke * 0.4, smoke * 0.8) * G.SCALE
            g = rng.randint(120, 175)
            a = max(40, 150 - frame * 12)
            _blob(d, x, y, rad, (g, g, g, a))

    # bright shell streak arcing out of the bore
    if reach > 0:
        sx, sy = G.P(ox, oy, h, G.MUZZLE_F + reach, 0, G.MUZZLE_LIFT + reach * 0.28)
        hx, hy = G.P(ox, oy, h, G.MUZZLE_F + reach * 0.6, 0, G.MUZZLE_LIFT + reach * 0.6 * 0.28)
        d.line([hx, hy, sx, sy], fill=FLASH_MID, width=3)
        _blob(d, sx, sy, 2.4 * G.SCALE, (*FLASH_OUT, 235))
        _blob(d, sx, sy, 1.3 * G.SCALE, (*FLASH_CORE, 255))

    # muzzle star flash: radial spikes + hot layered core
    if flash > 0:
        for ang in range(0, 360, 45):
            a = math.radians(ang + frame * 10)
            ex = mx + math.cos(a) * flash * 1.7 * G.SCALE
            ey = my + math.sin(a) * flash * 1.7 * G.SQUASH * G.SCALE
            d.line([mx, my, ex, ey], fill=FLASH_OUT, width=2)
        _blob(d, mx, my, flash * 1.15 * G.SCALE, FLASH_OUT)
        _blob(d, mx, my, flash * 0.72 * G.SCALE, FLASH_MID)
        _blob(d, mx, my, flash * 0.40 * G.SCALE, FLASH_CORE)


def draw_attack_cell(d, ox, oy, h, frame, seed):
    rec = RECOIL.get(frame, 0.0)
    bx, by = G.rot(-rec, 0, h)
    ox2 = ox + bx * G.SCALE
    oy2 = oy + by * G.SQUASH * G.SCALE
    # static body (no idle bob) so the blast reads as the motion
    G.draw_breaker(d, ox2, oy2, h, 0, False)
    draw_blast(d, ox2, oy2, h, frame, seed=hash((h,)) & 0xffff)


if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # Each cell is drawn on its own 150px tile and composited in, so no blast can
    # ever bleed into a neighbouring state/frame cell.
    for row in range(ROWS):
        for col in range(COLS):
            tile = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            td = ImageDraw.Draw(tile)
            draw_attack_cell(td, CELL//2, CELL//2, HEADINGS[col], row, seed=col)
            img.alpha_composite(tile, (col*CELL, row*CELL))

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/attack/breaker.png"
    img.save(out)
    print("wrote", out, img.size)
