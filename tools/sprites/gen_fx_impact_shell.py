#!/usr/bin/env python3
"""Shell impact tile-effect: the round a Mortar Truck, Breaker, Warmachine, Turret
or Battle Cruiser lobs landing on the tile it aimed at. A dark shell drops in from
above, detonates in a compact orange fireball that heaves a spray of dirt clods
upward, and settles into a drifting brown-grey dust puff. 10-frame strip.

Deliberately SMALL and warm: this marks *where a ranged hit landed* in a fast
game, so it has to read at a glance without competing with the big death blast
or the white shrapnel ring the Breaker's splash throws on the neighbours. No
concussion ring — the signature here is the dirt geyser and the smoke column.
"""
import math
import os
import random

import fx_common as fx

OUT = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/animation/tile-impact-shell.png"
FRAMES = 10

FLASH = (255, 250, 225)
HOT = (255, 208, 96)
FIRE = (255, 140, 44)
DEEP = (206, 80, 26)
DIRT = (92, 66, 44)
DIRT_DARK = (58, 42, 30)
SMOKE = (118, 106, 96)
SHELL = (40, 38, 42)

# per-frame: (fireball size 0..1, flash 0..1, clod height 0..1, dust 0..1)
ENV = [
    (0.0, 0.0, 0.0, 0.0),   # 0 shell falling in
    (0.55, 1.0, 0.15, 0.0),  # 1 detonation
    (1.0, 0.7, 0.6, 0.1),    # 2 fireball + dirt heaves
    (0.9, 0.25, 1.0, 0.25),  # 3 clods at apex
    (0.65, 0.0, 0.85, 0.45),  # 4 clods falling, smoke swells
    (0.4, 0.0, 0.5, 0.65),   # 5
    (0.2, 0.0, 0.15, 0.8),   # 6 dust cloud
    (0.05, 0.0, 0.0, 0.7),   # 7 drifting
    (0.0, 0.0, 0.0, 0.45),   # 8 thinning
    (0.0, 0.0, 0.0, 0.2),    # 9 last haze
]

# clod trajectories: (x direction, peak height px, size) — a fan biased upward
CLODS = [
    (-0.9, 16, 3.6), (-0.5, 24, 3.0), (-0.15, 28, 3.8), (0.2, 26, 3.2),
    (0.55, 22, 2.9), (0.95, 14, 3.5), (-0.3, 12, 2.4), (0.4, 10, 2.5),
]


def draw_frame(cell, f):
    size, flash, clod_h, dust = ENV[f]
    rng = random.Random(6101 + f * 53)
    cx, cy = fx.TILE_CX, fx.TILE_CY

    # frame 0: the incoming shell — a dark dot dropping steeply from the upper
    # right with a faint grey trail, so the eye is led to the tile before it pops.
    if f == 0:
        fx.streak(cell, (cx + 16, 4), (cx + 4, cy - 14), (200, 196, 190), 110, 1.2)
        fx.blob(cell, cx + 4, cy - 14, 2.2, SHELL, 240)
        fx.blob(cell, cx + 4, cy - 14, 1.2, (120, 118, 124), 200)
        return

    # scorch pool that lingers under everything after the burst
    if f >= 1:
        fx.blob(cell, cx, cy + 3, 11 + 5 * min(1, size + dust), DIRT_DARK,
                int(110 * (1 - dust * 0.4)), squash=0.45)

    # compact fireball: deep orange body, hot centre, white flash on detonation
    if size > 0:
        fx.blob(cell, cx, cy - 2, 17 * size + 4, DEEP, int(210 * size))
        fx.blob(cell, cx, cy - 3, 12 * size + 3, FIRE, int(235 * size))
        fx.blob(cell, cx, cy - 4, 7.5 * size + 2, HOT, int(245 * size))
    if flash > 0:
        fx.blob(cell, cx, cy - 3, 11 * flash + 3, FLASH, int(252 * flash))

    # dirt clods heaved up in an arc: each rides its own parabola, peaking when
    # clod_h hits 1 and sinking back as it falls off
    if clod_h > 0:
        for i, (dx, peak, rad) in enumerate(CLODS):
            # rising phase maps clod_h to height; falling phase brings it down and
            # spreads it out sideways a little further
            t = clod_h
            h = peak * math.sin(t * math.pi / 2) if f <= 3 else peak * t
            x = cx + dx * (8 + (1 - t) * 6 if f > 3 else 8 * t + 2)
            y = cy - 2 - h
            fx.blob(cell, x, y, rad, DIRT, 235)
            fx.blob(cell, x - 0.5, y - 0.5, rad * 0.55, DIRT_DARK, 200)
            # hot fleck on the underside of the early clods
            if f <= 3 and i % 3 == 0:
                fx.blob(cell, x, y + 1, rad * 0.5, HOT, int(190 * size))

    # brown-grey dust puff swelling up and out of the fireball's place
    if dust > 0:
        for _ in range(int(9 * dust) + 3):
            sx = cx + rng.uniform(-1, 1) * (7 + 8 * dust)
            sy = cy - 4 - rng.uniform(0, 1) * (10 + 14 * dust)
            g = rng.randint(-10, 10)
            col = (SMOKE[0] + g, SMOKE[1] + g, SMOKE[2] + g)
            fx.blob(cell, sx, sy, rng.uniform(6, 10) * (0.6 + dust * 0.5), col,
                    int(175 * dust), squash=0.9)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fx.assemble(draw_frame, FRAMES, OUT)
