#!/usr/bin/env python3
"""Slug impact tile-effect: a Strider's heavy sniper round striking the tile it
aimed at. A pale tracer line snaps in from the upper left, a tight white spark
flash at the strike point, a handful of ricochet sparks skipping away, and a
small puff of kicked-up dust. 8-frame strip — a kinetic hit, so it is over fast.

The smallest and quickest of the payload impacts: no fireball, no smoke column,
just the crack and the sparks, so a Strider's shot reads as a bullet and not a
shell.
"""
import math
import os
import random

import fx_common as fx

OUT = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/animation/tile-impact-slug.png"
FRAMES = 8

WHITE = (255, 255, 255)
TRACER = (255, 240, 180)
SPARK = (255, 226, 140)
EMBER = (255, 170, 80)
DUST = (150, 138, 122)

# per-frame: (flash 0..1, spark travel 0..1, spark strength 0..1, dust 0..1)
ENV = [
    (0.0, 0.0, 0.0, 0.0),   # 0 tracer inbound
    (1.0, 0.1, 1.0, 0.1),   # 1 strike
    (0.5, 0.4, 0.9, 0.35),  # 2 sparks skip
    (0.15, 0.7, 0.6, 0.5),  # 3
    (0.0, 0.9, 0.3, 0.45),  # 4
    (0.0, 1.0, 0.1, 0.3),   # 5 dust settling
    (0.0, 1.0, 0.0, 0.15),  # 6
    (0.0, 1.0, 0.0, 0.05),  # 7 gone
]

# ricochet directions: sparks skip mostly up and away from the incoming tracer
# (which arrives from the upper left), so they fan up-right and out
SPARKS = [
    (0.9, -0.6, 17), (0.6, -0.95, 14), (1.0, -0.15, 13), (0.2, -1.0, 16),
    (-0.4, -0.9, 11), (0.75, -0.8, 19), (-0.85, -0.5, 10), (0.45, -0.5, 9),
]
PLANE = 0.7


def draw_frame(cell, f):
    flash, travel, spark, dust = ENV[f]
    rng = random.Random(4477 + f * 71)
    cx, cy = fx.TILE_CX, fx.TILE_CY

    # frame 0: tracer coming in from the upper left, head just short of the tile
    if f == 0:
        fx.streak(cell, (2, 8), (cx - 5, cy - 6), TRACER, 220, 1.3)
        fx.streak(cell, (10, 20), (cx - 5, cy - 6), WHITE, 160, 0.8)
        fx.blob(cell, cx - 5, cy - 6, 1.6, WHITE, 255)
        return

    # frame 1 still shows the tail of the tracer reaching the strike point
    if f == 1:
        fx.streak(cell, (12, 26), (cx, cy - 1), TRACER, 160, 1.1)

    # tight strike flash
    if flash > 0:
        fx.blob(cell, cx, cy - 1, 11 * flash + 3, EMBER, int(200 * flash))
        fx.blob(cell, cx, cy - 1, 7 * flash + 2, SPARK, int(245 * flash))
        fx.blob(cell, cx, cy - 1, 4 * flash + 1.5, WHITE, int(255 * flash))

    # ricochet sparks skipping away with short glowing tails
    if spark > 0.02:
        for dx, dy, reach in SPARKS:
            d = reach * travel
            x = cx + dx * d
            y = cy - 1 + dy * d * PLANE
            # gravity: the further along, the more the spark sags back down
            y += (travel ** 2) * 6
            for k in range(3):
                tt = k / 2
                tx = x - dx * tt * 4 * spark
                ty = y - dy * tt * 4 * spark * PLANE
                fx.blob(cell, tx, ty, (2.6 - tt * 1.4) * spark + 0.7, SPARK,
                        int((245 - tt * 110) * spark))
            fx.blob(cell, x, y, 1.5 * spark + 0.6, WHITE, int(240 * spark))

    # a small dust puff kicked off the ground at the strike point
    if dust > 0:
        for _ in range(int(4 * dust) + 1):
            sx = cx + rng.uniform(-1, 1) * (3 + 5 * dust)
            sy = cy - rng.uniform(0, 1) * (4 + 6 * dust)
            fx.blob(cell, sx, sy, rng.uniform(4, 6) * (0.7 + dust * 0.4), DUST,
                    int(160 * dust), squash=0.7)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fx.assemble(draw_frame, FRAMES, OUT)
