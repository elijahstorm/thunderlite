#!/usr/bin/env python3
"""Missile impact tile-effect: a Shrike Interdictor's guided missile striking the
tile it aimed at. A bright exhaust streak dives in from high above, a hard
blue-white detonation flash with a compact pale ring, then a dark smoke column
climbs off the strike point with a few sparks in it. 10-frame strip.

Cool-toned so it reads apart from the warm shell and rocket bursts, but kept
distinct from the Lance's pierce shock too: no long spikes and a much smaller
ring, with the dark rising smoke doing the lingering.
"""
import math
import os
import random

import fx_common as fx

OUT = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/animation/tile-impact-missile.png"
FRAMES = 10

WHITE = (255, 255, 255)
PALE = (214, 236, 255)
ICE = (150, 200, 255)
STEEL = (96, 140, 220)
EXHAUST = (255, 226, 170)
SMOKE = (70, 70, 78)
SPARK = (255, 240, 200)

# per-frame: (flash 0..1, ring radius px, ring strength 0..1, smoke 0..1)
ENV = [
    (0.0, 0, 0.0, 0.0),    # 0 missile diving in
    (1.0, 3, 1.0, 0.0),    # 1 detonation
    (0.6, 9, 0.9, 0.15),   # 2 ring snaps out
    (0.25, 14, 0.6, 0.4),  # 3 ring fading, smoke lifts
    (0.08, 17, 0.3, 0.7),  # 4
    (0.0, 18, 0.1, 0.9),   # 5 smoke column
    (0.0, 0, 0.0, 0.85),   # 6
    (0.0, 0, 0.0, 0.6),    # 7 thinning
    (0.0, 0, 0.0, 0.35),   # 8
    (0.0, 0, 0.0, 0.15),   # 9 gone
]
SQUASH_Y = 0.62


def draw_frame(cell, f):
    flash, ring, rstr, smoke = ENV[f]
    rng = random.Random(9931 + f * 43)
    cx, cy = fx.TILE_CX, fx.TILE_CY

    # frame 0: the missile — a bright exhaust streak dropping almost vertically
    # from the top of the cell with a hot head just short of the tile
    if f == 0:
        fx.streak(cell, (cx - 6, 0), (cx - 1, cy - 12), EXHAUST, 200, 1.6)
        fx.streak(cell, (cx - 6, 0), (cx - 1, cy - 12), WHITE, 120, 0.9)
        fx.blob(cell, cx - 1, cy - 12, 2.4, (54, 58, 70), 245)
        fx.blob(cell, cx - 1, cy - 11, 1.6, WHITE, 230)
        return

    # scorch under the strike
    fx.blob(cell, cx, cy + 3, 10 + 4 * smoke, (40, 40, 46), int(120 * (1 - smoke * 0.4)),
            squash=0.45)

    # compact pale ring
    if rstr > 0.02 and ring > 1:
        n = max(14, int(ring * 3.2))
        for i in range(n):
            a = 2 * math.pi * i / n
            x = cx + math.cos(a) * ring
            y = cy - 1 + math.sin(a) * ring * SQUASH_Y
            fx.blob(cell, x, y, 3.8 * rstr + 1.0, STEEL, int(210 * rstr))
            fx.blob(cell, x, y, 2.4 * rstr + 0.7, PALE, int(240 * rstr))
            fx.blob(cell, x, y, 1.2 * rstr + 0.4, WHITE, int(240 * rstr))

    # detonation flash: steel-blue body, icy mid, white core
    if flash > 0:
        fx.blob(cell, cx, cy - 2, 16 * flash + 4, STEEL, int(190 * flash))
        fx.blob(cell, cx, cy - 3, 11 * flash + 3, ICE, int(235 * flash))
        fx.blob(cell, cx, cy - 3, 7 * flash + 2, WHITE, int(252 * flash))

    # dark smoke column rising off the strike point, sparks riding in it early
    if smoke > 0:
        rise = 8 + 22 * smoke
        for _ in range(int(10 * smoke) + 3):
            t = rng.uniform(0, 1)
            sx = cx + rng.uniform(-1, 1) * (3 + 5 * t)
            sy = cy - 4 - t * rise
            g = rng.randint(-8, 8)
            fx.blob(cell, sx, sy, rng.uniform(5, 8) * (0.7 + smoke * 0.4),
                    (SMOKE[0] + g, SMOKE[1] + g, SMOKE[2] + g), int(190 * smoke), squash=0.9)
        if f <= 4:
            for _ in range(3):
                a = rng.uniform(-math.pi, 0)
                d = rng.uniform(5, 11)
                fx.blob(cell, cx + math.cos(a) * d, cy - 3 + math.sin(a) * d, 1.6, SPARK, 245)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fx.assemble(draw_frame, FRAMES, OUT)
