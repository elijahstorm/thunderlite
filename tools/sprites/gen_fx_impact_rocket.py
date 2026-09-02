#!/usr/bin/env python3
"""Rocket impact tile-effect: a Rocket Truck's salvo arriving on the tile it aimed
at. Three thin white exhaust trails streak down from above, then three staggered
red-orange pops walk across the tile a frame apart, each leaving a small grey
smoke curl. 10-frame strip.

Reads apart from the single shell burst by being a *cluster*: several small,
hard pops instead of one fireball and dirt geyser, with the incoming smoke trails
still hanging in the air above them.
"""
import math
import os
import random

import fx_common as fx

OUT = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/animation/tile-impact-rocket.png"
FRAMES = 10

FLASH = (255, 246, 226)
HOT = (255, 190, 80)
FIRE = (255, 96, 48)
DEEP = (190, 48, 32)
TRAIL = (236, 236, 232)
SMOKE = (112, 108, 108)

# The three rockets: (landing x offset, landing y offset, frame it detonates).
# Each trail arrives from a slightly different angle up-left so the salvo fans.
ROCKETS = [
    (-9, -3, 1),
    (8, 1, 2),
    (-1, 6, 3),
]
POP_LIFE = 4  # frames a single pop takes to burn out


def draw_frame(cell, f):
    rng = random.Random(8817 + f * 61)
    cx, cy = fx.TILE_CX, fx.TILE_CY

    for i, (ox, oy, hit) in enumerate(ROCKETS):
        lx, ly = cx + ox, cy + oy
        # exhaust trail: fully drawn as the rocket comes in (frames before + at the
        # hit), then lingers and fades above the tile for a few frames after
        age = f - hit
        if age <= 2:
            # the trail's origin, high and off to the left, spread per rocket
            sx = lx - 14 - i * 4
            sy = 2 + i * 3
            if age < 0:
                # still inbound: the head is partway down the trail
                t = 0.45 + 0.35 * (hit - f) * -1 + 0.55
                t = min(1.0, max(0.35, 1.0 - 0.3 * (hit - f)))
                hx, hy = sx + (lx - sx) * t, sy + (ly - sy) * t
                fx.streak(cell, (sx, sy), (hx, hy), TRAIL, 150, 1.4)
                fx.blob(cell, hx, hy, 1.6, (60, 58, 62), 240)
                fx.blob(cell, hx, hy, 1.0, HOT, 230)
            else:
                fade = 1.0 - age * 0.38
                fx.streak(cell, (sx, sy), (lx - (lx - sx) * 0.25, ly - (ly - sy) * 0.25),
                          TRAIL, int(120 * fade), 1.6)

        # the pop itself
        if 0 <= age < POP_LIFE:
            k = age / (POP_LIFE - 1)
            size = 1.0 - k * 0.75
            # small scorch under it
            fx.blob(cell, lx, ly + 2, 6 + 3 * k, (52, 40, 36), int(120 * (1 - k * 0.5)),
                    squash=0.5)
            fx.blob(cell, lx, ly - 1, 11 * size + 3, DEEP, int(215 * size))
            fx.blob(cell, lx, ly - 2, 7.5 * size + 2, FIRE, int(240 * size))
            if age == 0:
                fx.blob(cell, lx, ly - 2, 8, FLASH, 252)
            elif age == 1:
                fx.blob(cell, lx, ly - 3, 4.5, HOT, 245)
            # a few sparks kicked out on the first two frames
            if age <= 1:
                for _ in range(4):
                    a = rng.uniform(0, 2 * math.pi)
                    d = rng.uniform(4, 9) * (1 + age)
                    fx.blob(cell, lx + math.cos(a) * d, ly - 2 + math.sin(a) * d * 0.6,
                            1.7, HOT, 235)
        # smoke curl after the pop burns down
        if age >= 2 and age <= 6:
            k = (age - 2) / 4
            for _ in range(2):
                fx.blob(cell, lx + rng.uniform(-3, 3), ly - 5 - k * 10 + rng.uniform(-2, 2),
                        5 + 4 * k, SMOKE, int(150 * (1 - k)), squash=0.9)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fx.assemble(draw_frame, FRAMES, OUT)
