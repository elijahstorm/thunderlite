#!/usr/bin/env python3
"""Shrapnel burst tile-effect: the explosive splash a Breaker shell or Albatross
Gunship cannon throws onto a neighbouring tile. A hard white flash, a bright
expanding shock ring, a fast fan of sparks and debris chunks flung outward, then
settling dust. 10-frame strip.

Deliberately harsher and cooler than the flame wash: a sharp concussion (white /
yellow, snapping outward as a ring) rather than a lingering orange burn, so the
two splash flavours read apart at a glance. Tuned bright and large on purpose so
the hit is easy to spot over a busy, colourful board.
"""
import math
import os
import random

import fx_common as fx

OUT = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/animation/tile-shrapnel.png"
FRAMES = 10

FLASH = (255, 252, 240)   # detonation flash (near-white)
SPARK = (255, 224, 138)   # hot spark
EMBER = (255, 150, 60)    # orange ember core
DEBRIS = (54, 48, 46)     # dark fragment
HOTEDGE = (255, 236, 180)  # bright leading edge on a chunk

# per-frame: (ring radius in px, spark strength 0..1, flash strength 0..1,
# dust strength 0..1, shock-ring strength 0..1)
ENV = [
    (4, 1.0, 1.0, 0.0, 1.0),    # 0 detonation flash
    (12, 1.0, 0.85, 0.0, 1.0),  # 1 concussion ring snaps out
    (19, 1.0, 0.4, 0.05, 0.7),  # 2 fragments fly
    (25, 0.9, 0.12, 0.15, 0.35),  # 3 spread
    (29, 0.7, 0.0, 0.3, 0.12),  # 4 outer edge
    (32, 0.5, 0.0, 0.45, 0.0),  # 5 slowing
    (34, 0.32, 0.0, 0.6, 0.0),  # 6 falling
    (35, 0.16, 0.0, 0.7, 0.0),  # 7 dust
    (36, 0.06, 0.0, 0.6, 0.0),  # 8 haze
    (36, 0.0, 0.0, 0.4, 0.0),   # 9 clearing
]

# fixed fragment directions so a chunk flies coherently outward frame to frame.
# A full fan (12 spokes) so the burst reads as an even radial spray.
FRAG_DIRS = [
    (0.0, -1.0), (0.5, -0.87), (0.87, -0.5), (1.0, 0.0), (0.87, 0.5), (0.5, 0.87),
    (0.0, 1.0), (-0.5, 0.87), (-0.87, 0.5), (-1.0, 0.0), (-0.87, -0.5), (-0.5, -0.87),
]

# vertical squash to seat the burst on the tilted tile plane
PLANE = fx.CELL_H / fx.CELL_W * 0.62


def draw_frame(cell, f):
    ring, spark, flash, dust, shock = ENV[f]
    rng = random.Random(4241 + f * 37)
    cx, cy = fx.TILE_CX, fx.TILE_CY

    # ground scorch pool that lingers under it all
    if f >= 1:
        fx.blob(cell, cx, cy + 4, min(22, ring * 0.95), (44, 36, 34),
                int(90 * (1 - dust * 0.5)), squash=0.45)

    # bright expanding shock ring — the signature read of a concussion. A circle of
    # hot blobs at the current radius, white-hot early then cooling to spark yellow.
    if shock > 0.02:
        ring_col = FLASH if shock > 0.6 else SPARK
        n = 24
        for i in range(n):
            ang = 2 * math.pi * i / n
            rx = cx + math.cos(ang) * ring
            ry = cy + math.sin(ang) * ring * 0.62
            fx.blob(cell, rx, ry, 2.8 * shock + 1.3, ring_col, int(230 * shock))

    # central flash / fireball at detonation — big and bright
    if flash > 0:
        fx.blob(cell, cx, cy, 24 * flash + 7, EMBER, int(210 * flash))
        fx.blob(cell, cx, cy, 16 * flash + 5, SPARK, int(235 * flash))
        fx.blob(cell, cx, cy, 10 * flash + 3, FLASH, int(252 * flash))

    # radial spark streaks + debris chunks riding fixed directions outward. The
    # vertical component is squashed to sit the burst on the tilted tile plane.
    for i, (dx, dy) in enumerate(FRAG_DIRS):
        jit = rng.uniform(-2, 2)
        dist = ring + jit
        x = cx + dx * dist
        y = cy + dy * dist * PLANE
        if spark > 0.05:
            # spark: a bright streak trailing back toward the blast centre, drawn as
            # a few fading blobs so it keeps a glowing tail
            for k in range(5):
                tt = k / 4
                sxp = cx + dx * (dist - tt * 8 * spark)
                syp = cy + dy * (dist - tt * 8 * spark) * PLANE
                fx.blob(cell, sxp, syp, (3.2 - tt * 1.9) * spark + 1.0,
                        SPARK, int((245 - tt * 110) * spark))
        # a dark debris chunk with a hot leading edge for the early-mid frames
        if 1 <= f <= 6 and i % 2 == 0:
            fx.blob(cell, x, y, rng.uniform(2.0, 3.6), DEBRIS, int(220 * (1 - dust)))
            if spark > 0.1:
                fx.blob(cell, x, y, rng.uniform(1.0, 1.8), HOTEDGE, int(180 * spark))

    # smoke/dust cloud swelling as the sparks die — lighter so it stays readable
    if dust > 0:
        for _ in range(int(7 * dust) + 1):
            sx = cx + rng.uniform(-1, 1) * ring * 0.7
            sy = cy + rng.uniform(-1, 0.4) * ring * 0.5
            g = rng.randint(120, 160)
            fx.blob(cell, sx, sy, rng.uniform(6, 11) * (0.6 + dust),
                    (g, g - 6, g - 12), int(120 * dust), squash=0.85)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fx.assemble(draw_frame, FRAMES, OUT)
