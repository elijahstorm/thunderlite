#!/usr/bin/env python3
"""Kinetic pierce tile-effect: the shock a Lance Tank's shaft leaves as it drives
through the tile behind its target. A hard white impact flash, a bright electric
shockwave ring snapping wide across the tile, and long sharp radial spikes — bold
and luminous so it reads clearly at a glance, cold-toned so it never looks like a
fiery explosion. 10-frame vertical strip.

Directionless (the sheet has no state columns), so it's a symmetric burst that
sits right whichever way the lance was pointing.
"""
import os
import math
import random

import fx_common as fx

OUT = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/animation/tile-pierce.png"
FRAMES = 10

WHITE = (255, 255, 255)
PALE = (198, 234, 255)   # near-white cyan
CYAN = (120, 210, 255)   # bright electric cyan
BLUE = (70, 150, 255)    # saturated blue body
SPARK = (224, 244, 255)

# per-frame: (ring radius px, ring strength 0..1, spike length px, core strength).
# Bigger and brighter than before — the ring sweeps most of the tile and the spikes
# reach the cell's edges, so the shock is unmistakable before it snaps away.
ENV = [
    (0, 0.0, 12, 1.0),     # 0 impact flash
    (10, 1.0, 26, 1.0),    # 1 crack outward, spikes at full reach
    (18, 1.0, 30, 0.7),    # 2 shock ring wide + spikes
    (24, 0.95, 24, 0.4),   # 3 ring driving out
    (27, 0.7, 16, 0.18),   # 4 widening
    (28, 0.45, 9, 0.06),   # 5 fading ring
    (28, 0.26, 4, 0.0),    # 6 ghost ring
    (28, 0.14, 0, 0.0),    # 7 last echo
    (28, 0.06, 0, 0.0),    # 8 almost gone
    (28, 0.0, 0, 0.0),     # 9 clear
]

# eight symmetric spike directions (squashed vertically onto the tile plane)
SPIKES = [(math.cos(a), math.sin(a)) for a in [i * math.pi / 4 for i in range(8)]]
SQUASH_Y = 0.66


def draw_frame(cell, f):
    ring, rstr, spike, core = ENV[f]
    rng = random.Random(7331 + f * 29)
    cx, cy = fx.TILE_CX, fx.TILE_CY

    # thick, bright shockwave ring: a dense necklace of fat blobs on the circle,
    # electric-cyan body under a white leading edge
    if rstr > 0.02 and ring > 1:
        n = max(14, int(ring * 2.0))
        for i in range(n):
            a = 2 * math.pi * i / n
            x = cx + math.cos(a) * ring
            y = cy + math.sin(a) * ring * SQUASH_Y
            fx.blob(cell, x, y, 4.4 * rstr + 1.2, BLUE, int(220 * rstr))
            fx.blob(cell, x, y, 3.0 * rstr + 0.9, CYAN, int(235 * rstr))
            fx.blob(cell, x, y, 1.6 * rstr + 0.6, WHITE, int(240 * rstr))

    # long sharp radial spikes stabbing outward from the impact
    if spike > 0:
        for dx, dy in SPIKES:
            steps = max(4, int(spike / 2.2))
            for s in range(steps):
                t = s / max(1, steps - 1)
                x = cx + dx * spike * t
                y = cy + dy * spike * t * SQUASH_Y
                rad = 4.2 - t * 3.2
                if rad < 0.7:
                    continue
                col = WHITE if t < 0.4 else (CYAN if t < 0.72 else BLUE)
                fx.blob(cell, x, y, rad, col, int(240 * (1 - t * 0.55)))

    # blazing impact core
    if core > 0:
        fx.blob(cell, cx, cy, 15 * core + 3, BLUE, int(180 * core))
        fx.blob(cell, cx, cy, 10 * core + 3, CYAN, int(225 * core))
        fx.blob(cell, cx, cy, 6.5 * core + 2, PALE, int(240 * core))
        fx.blob(cell, cx, cy, 3.5 * core + 1.5, WHITE, 255)

    # glinting shards thrown off with the shock
    if 1 <= f <= 4:
        for _ in range(rng.randint(3, 6)):
            a = rng.uniform(0, 2 * math.pi)
            d = ring * rng.uniform(0.4, 1.05)
            x = cx + math.cos(a) * d
            y = cy + math.sin(a) * d * SQUASH_Y
            fx.blob(cell, x, y, rng.uniform(1.2, 2.4), SPARK, 235)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fx.assemble(draw_frame, FRAMES, OUT)
