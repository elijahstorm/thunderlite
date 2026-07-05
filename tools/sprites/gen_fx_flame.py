#!/usr/bin/env python3
"""Flame wash tile-effect: the fire a Scorcher's splash/burn throws onto a
neighbouring tile. A bloom of fire erupts from the tile, licks upward in a few
tongues, then collapses into embers and drifting smoke. 10-frame vertical strip.
"""
import os
import random

import fx_common as fx

OUT = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/animation/tile-flame.png"
FRAMES = 10

# fire palette (shared roster warmth)
DEEP = (214, 74, 22)     # outer body, deep orange
MID = (255, 138, 34)     # bright orange
HOT = (255, 200, 70)     # yellow
CORE = (255, 244, 190)   # yellow-white throat
SMOKE = (74, 66, 62)     # cooling smoke

# per-frame envelope: (overall size, how high the tongues reach in px above the
# tile floor, hot-core strength 0..1, smoke amount 0..1)
ENV = [
    (0.45, 10, 0.9, 0.0),   # 0 ignition spark
    (0.72, 20, 1.0, 0.0),   # 1 catching
    (0.95, 32, 1.0, 0.0),   # 2 climbing
    (1.08, 42, 0.95, 0.05),  # 3 roaring
    (1.10, 46, 0.85, 0.12),  # 4 peak
    (0.98, 40, 0.6, 0.28),   # 5 collapsing
    (0.80, 32, 0.35, 0.5),   # 6 guttering
    (0.60, 24, 0.15, 0.7),   # 7 embers
    (0.42, 18, 0.05, 0.85),  # 8 smoke
    (0.26, 12, 0.0, 1.0),    # 9 last wisp
]


def draw_frame(cell, f):
    size, reach, core, smoke = ENV[f]
    rng = random.Random(1009 + f * 41)
    cx, floor = fx.TILE_CX, fx.TILE_CY + 6  # fire roots just below tile centre

    # low glow pool on the ground, squashed to the tile plane
    fx.blob(cell, cx, floor, 20 * size, DEEP, int(150 * (1 - smoke * 0.7)), squash=0.5)
    fx.blob(cell, cx, floor, 13 * size, MID, int(150 * (1 - smoke * 0.6)), squash=0.5)

    # rising body: overlapping blobs from the floor up to `reach`, narrowing and
    # cooling with height; a few offset tongues give the fire a licking silhouette
    tongues = [0.0, -0.55, 0.5, -0.28, 0.3]
    for ti, off in enumerate(tongues):
        # outer tongues are shorter and lag the central column
        tscale = 1.0 if ti == 0 else rng.uniform(0.5, 0.8)
        steps = max(3, int(reach / 5))
        for s in range(steps):
            t = s / max(1, steps - 1)
            y = floor - t * reach * tscale
            x = cx + off * 9 * size + rng.uniform(-2, 2) + off * t * 6
            # blob gets smaller and cooler toward the tip
            rad = (10 - t * 6) * size * (1.0 if ti == 0 else 0.75)
            if rad < 1.2:
                continue
            # colour ramp: deep -> mid -> hot with height, hottest low and central
            heat = (1 - t) * (1.0 if ti == 0 else 0.7)
            if heat > 0.72:
                col, a = HOT, 210
            elif heat > 0.4:
                col, a = MID, 200
            else:
                col, a = DEEP, 180
            a = int(a * (1 - smoke * 0.75))
            if a > 4:
                fx.blob(cell, x, y, rad, col, a)

    # blazing core throat at the base while it burns hot
    if core > 0:
        fx.blob(cell, cx, floor - 4 * size, 7 * size, HOT, int(220 * core))
        fx.blob(cell, cx, floor - 5 * size, 4 * size, CORE, int(235 * core))

    # a couple of loose embers spat upward mid-burn
    if 1 <= f <= 6:
        for _ in range(rng.randint(1, 3)):
            ex = cx + rng.uniform(-14, 14) * size
            ey = floor - rng.uniform(0.4, 1.0) * reach
            fx.blob(cell, ex, ey, rng.uniform(1.2, 2.2), HOT, 200)

    # smoke rising off the top as the fire dies
    if smoke > 0:
        for _ in range(int(4 * smoke) + 1):
            sx = cx + rng.uniform(-10, 10) * size
            sy = floor - reach - rng.uniform(0, 14)
            g = rng.randint(60, 95)
            fx.blob(cell, sx, sy, rng.uniform(4, 8) * size, (g, g - 6, g - 10),
                    int(120 * smoke), squash=0.9)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fx.assemble(draw_frame, FRAMES, OUT)
