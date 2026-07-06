#!/usr/bin/env python3
"""Nightjar attack sheet — a silent decloak strike.

150px cells, 4 state columns (right/down/left/up) x 8 rows, xOffset/yOffset 45.
Reuses the idle generator so the airframe stays pixel-identical. The Nightjar is
dark and silent until it strikes: it flares a violet DECLOAK rim, lances a short
phase-blade at the target (frames 0-4), then dims back toward cloak (5-7). This
bright moment is the only time it isn't a shadow — the knife coming out of the
dark.
"""
import math, os, sys, random
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_nightjar as G
from lighting import relight

CELL = 150
COLS, ROWS = 4, 8
W, H = CELL * COLS, CELL * ROWS
HEADINGS = [90, 180, 270, 0]

NOSE_F = 12.5

# per-frame lance profile: (reach forward in local px, thickness) — a clean stab,
# not a spray. Tip budget: the render window is exactly this unit's 150px cell, so
# (NOSE_F + reach) * SCALE 1.5 + bloom must stay inside 75px of the cell centre.
LANCE = {0: (5, 1.0), 1: (16, 1.4), 2: (26, 1.8), 3: (30, 2.0), 4: (26, 1.6),
         5: (16, 1.2), 6: (8, 0.9), 7: (0, 0.0)}
RECOIL = {1: 0.5, 2: 1.1, 3: 1.4, 4: 1.0, 5: 0.4}
# decloak-rim strength per frame (0..1): flares as the strike lands, fades to cloak.
DECLOAK = {0: 0.35, 1: 0.7, 2: 1.0, 3: 1.0, 4: 0.85, 5: 0.55, 6: 0.3, 7: 0.12}


def phase_lance(d, ox, oy, h, frame):
    reach, thick = LANCE[frame]
    lift = G.LIFT + 1.1
    if reach > 0:
        a = G.P(ox, oy, h, NOSE_F, 0, lift)
        b = G.P(ox, oy, h, NOSE_F + reach, 0, lift)
        # outer violet glow -> bright core
        d.line([a, b], fill=G.VIOLET_D, width=int(thick * 3) + 2, joint="curve")
        d.line([a, b], fill=G.VIOLET_B, width=int(thick * 2) + 1, joint="curve")
        d.line([a, b], fill=G.VIOLET_W, width=max(1, int(thick)), joint="curve")
        # impact bloom on the peak frames
        if frame in (2, 3, 4):
            fx, fy = b
            rad = 4 + (frame == 3) * 2
            d.ellipse([fx - rad, fy - rad * G.SQUASH, fx + rad, fy + rad * G.SQUASH], fill=G.VIOLET_B)
            d.ellipse([fx - rad * 0.5, fy - rad * 0.5 * G.SQUASH,
                       fx + rad * 0.5, fy + rad * 0.5 * G.SQUASH], fill=G.VIOLET_W)
    # muzzle spark at the nose
    mx, my = G.P(ox, oy, h, NOSE_F, 0, lift)
    r = 2 + DECLOAK[frame] * 2
    d.ellipse([mx - r, my - r * G.SQUASH, mx + r, my + r * G.SQUASH], fill=G.VIOLET_B)
    d.ellipse([mx - r * 0.5, my - r * 0.5 * G.SQUASH,
               mx + r * 0.5, my + r * 0.5 * G.SQUASH], fill=G.VIOLET_W)


def decloak_rim(d, ox, oy, h, frame):
    # a ring of violet embers hugging the hull edge — the cloak field snapping off.
    # Drawn before the hull so it only peeks out around the silhouette.
    s = DECLOAK[frame]
    if s <= 0.05:
        return
    lift = G.LIFT + 0.8
    n = 16
    rng = random.Random(frame * 97 + 3)
    for i in range(n):
        ang = i / n * math.tau
        rad = 10.5 + rng.uniform(-0.8, 0.8)
        f = math.cos(ang) * rad * 0.9
        r = math.sin(ang) * rad
        col = G.VIOLET_B if (i % 2 == 0) else G.VIOLET_D
        G.disc(d, ox, oy, h, f, r, 0.6 + s * 0.7, col, lift=lift)


def draw_attack_cell(d, ox, oy, h, frame):
    rec = RECOIL.get(frame, 0.0)
    bx, by = G.rot(-rec, 0, h)
    ox2 = ox + bx * G.SCALE
    oy2 = oy + by * G.SQUASH * G.SCALE
    decloak_rim(d, ox2, oy2, h, frame)
    G.draw_nightjar(d, ox2, oy2, h, 0, True)
    phase_lance(d, ox2, oy2, h, frame)


if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # Each cell is composited from its own 150px tile so no lance can bleed into a
    # neighbouring state/frame (the in-game overlay shows exactly one cell).
    for row in range(ROWS):
        for col in range(COLS):
            tile = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            td = ImageDraw.Draw(tile)
            draw_attack_cell(td, CELL // 2, 73, HEADINGS[col], row)
            img.alpha_composite(tile, (col * CELL, row * CELL))

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/attack/nightjar.png"
    img.save(out)
    print("wrote", out, img.size)
