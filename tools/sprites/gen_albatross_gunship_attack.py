#!/usr/bin/env python3
"""Albatross Gunship attack sheet — a ROCKET VOLLEY rippling off the wing pods.

150px cells, 4 state columns (right/down/left/up) x 8 rows, xOffset/yOffset 45.
Reuses the idle generator so the airframe stays pixel-identical. Rockets streak
out over frames 0-3; frames 3-6 bloom into overlapping splash explosions (this
is the splash-damage unit, so the payoff is a wide burst, not a single hit).
"""
import math, os, sys, random
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_albatross_gunship as G
from lighting import relight

CELL = 150
COLS, ROWS = 4, 8
W, H = CELL * COLS, CELL * ROWS
HEADINGS = [90, 180, 270, 0]

FLAME_D = (255, 120, 30)
FLAME_B = (255, 180, 60)
FLAME_Y = (255, 238, 170)
SMOKE   = (150, 146, 140)

# rockets launch from the two wing pods, staggered by frame
PODS = [(1.2, 6.5), (1.2, -6.5)]
IMPACT_F = 34.0          # where the volley lands (local forward px)


def blob(d, ox, oy, h, f, r, rad, color, lift):
    x, y = G.P(ox, oy, h, f, r, lift)
    rx, ry = rad * G.SCALE, rad * G.SQUASH * G.SCALE
    d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=color)


def rocket(d, ox, oy, h, pod, t, lift):
    """one rocket in flight at progress t (0 at pod, 1 at impact), smoke behind."""
    pf, pr = pod
    f = pf + (IMPACT_F - pf) * t
    r = pr * (1 - t * 0.85)          # converge toward the centreline
    # smoke trail puffs behind the rocket
    for k in range(3):
        tt = max(0.0, t - 0.12 * (k + 1))
        sf = pf + (IMPACT_F - pf) * tt
        sr = pr * (1 - tt * 0.85)
        blob(d, ox, oy, h, sf, sr, 1.2 + k * 0.35, SMOKE, lift + 0.4)
    # the rocket itself: a short bright dart with a flame tail
    x0, y0 = G.P(ox, oy, h, f - 2.2, r, lift)
    x1, y1 = G.P(ox, oy, h, f, r, lift)
    d.line([x0, y0, x1, y1], fill=G.METAL_HI, width=2)
    blob(d, ox, oy, h, f - 2.6, r, 0.8, FLAME_B, lift)
    blob(d, ox, oy, h, f + 0.3, r, 0.6, G.WHITE, lift)


def explosion(d, ox, oy, h, frame, rng, lift):
    """overlapping splash blooms around the impact point, growing then fading."""
    grow = {3: 0.5, 4: 1.0, 5: 0.9, 6: 0.6, 7: 0.3}[frame]
    n = int(6 * grow) + 2
    for _ in range(n):
        f = IMPACT_F + rng.uniform(-6, 6) * grow
        r = rng.uniform(-8, 8) * grow
        rad = rng.uniform(2.2, 4.6) * grow
        blob(d, ox, oy, h, f, r, rad, FLAME_D, lift)
    for _ in range(max(2, n - 2)):
        f = IMPACT_F + rng.uniform(-4, 4) * grow
        r = rng.uniform(-5.5, 5.5) * grow
        blob(d, ox, oy, h, f, r, rng.uniform(1.4, 2.8) * grow, FLAME_B, lift)
    blob(d, ox, oy, h, IMPACT_F, 0, 2.4 * grow, FLAME_Y, lift)
    if frame >= 5:      # sooty smoke as it burns out
        for _ in range(4):
            f = IMPACT_F + rng.uniform(-7, 7)
            r = rng.uniform(-7, 7)
            g = rng.randint(70, 105)
            blob(d, ox, oy, h, f, r, rng.uniform(1.6, 3.2), (g, g - 6, g - 12),
                 lift + rng.uniform(1, 3))


def volley(d, ox, oy, h, frame, seed):
    rng = random.Random(seed * 173 + frame * 29)
    lift = 2.0
    # rockets in flight, pods staggered half a beat apart
    stages = {0: (0.15, None), 1: (0.45, 0.2), 2: (0.75, 0.5), 3: (None, 0.8)}
    if frame in stages:
        t_a, t_b = stages[frame]
        if t_a is not None:
            rocket(d, ox, oy, h, PODS[0], t_a, lift)
        if t_b is not None:
            rocket(d, ox, oy, h, PODS[1], t_b, lift)
        # pod muzzle flash on launch frames
        if frame <= 1:
            for pf, pr in (PODS if frame == 0 else PODS[1:]):
                blob(d, ox, oy, h, pf + 1.5, pr, 1.2, FLAME_B, lift)
    if frame >= 3:
        explosion(d, ox, oy, h, frame, rng, lift)


def draw_attack_cell(d, ox, oy, h, frame, seed):
    G.draw_albatross(d, ox, oy, h, 0, False)
    volley(d, ox, oy, h, frame, seed)


if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for row in range(ROWS):
        for col in range(COLS):
            draw_attack_cell(d, col*CELL + CELL//2, row*CELL + 73,
                             HEADINGS[col], row, seed=col)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/attack/albatross-gunship.png"
    img.save(out)
    print("wrote", out, img.size)
