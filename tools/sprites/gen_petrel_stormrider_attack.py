#!/usr/bin/env python3
"""Petrel Stormrider attack sheet — a crackling STORM ARC lashed at the target.

150px cells, 4 state columns (right/down/left/up) x 8 rows, xOffset/yOffset 45.
Reuses the idle generator so the airframe stays pixel-identical; the arc is a
jagged lightning lash that reaches out over frames 0-4 and dissipates 5-7.
"""
import math, os, sys, random
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_petrel_stormrider as G
from lighting import relight

CELL = 150
COLS, ROWS = 4, 8
W, H = CELL * COLS, CELL * ROWS
HEADINGS = [90, 180, 270, 0]

NOSE_F = 14.0

# per-frame arc profile: (reach forward in local px, jag amplitude)
# Reach budget: the render window is exactly this unit's 150px cell, so the arc
# tip (NOSE_F 14 + reach, * SCALE 1.55, + bloom radius) must stay inside 75px of
# the cell centre or it leaks into the neighbouring state's frames.
ARC = {
    0: (6, 1.5),
    1: (14, 2.5),
    2: (22, 3.5),
    3: (28, 4.0),
    4: (27, 3.5),
    5: (18, 3.0),
    6: (10, 2.2),
    7: (4, 1.2),
}
RECOIL = {1: 0.4, 2: 0.9, 3: 1.2, 4: 1.0, 5: 0.4}


def bolt(d, ox, oy, h, frame, rng, r_bias, color, width, lift):
    reach, jag = ARC[frame]
    steps = max(3, int(reach / 5))
    pts = []
    for i in range(steps + 1):
        t = i / steps
        f = NOSE_F + t * reach
        r = r_bias * t + rng.uniform(-1, 1) * jag * math.sin(t * math.pi)
        pts.append(G.P(ox, oy, h, f, r, lift))
    d.line(pts, fill=color, width=width, joint="curve")
    return pts


def storm_arc(d, ox, oy, h, frame, seed):
    reach, jag = ARC[frame]
    if reach <= 0:
        return
    rng = random.Random(seed * 131 + frame * 17)
    lift = G.LIFT + 1.0

    # two outer glow strands + one bright core bolt
    bolt(d, ox, oy, h, frame, rng, rng.uniform(-3, 3), G.STORM_D, 4, lift)
    bolt(d, ox, oy, h, frame, rng, rng.uniform(-2, 2), G.STORM_B, 2, lift)
    tip_pts = bolt(d, ox, oy, h, frame, rng, 0, G.STORM_W, 1, lift)

    # forked side-tendrils near the tip
    for _ in range(2 if frame in (2, 3, 4) else 1):
        t0 = rng.uniform(0.5, 0.8)
        f0 = NOSE_F + t0 * reach
        r0 = rng.uniform(-jag, jag)
        f1 = f0 + reach * rng.uniform(0.15, 0.3)
        r1 = r0 + rng.uniform(-1, 1) * jag * 2.2
        d.line([G.P(ox, oy, h, f0, r0, lift), G.P(ox, oy, h, f1, r1, lift)],
               fill=G.STORM_B, width=1)

    # flash bloom at the impact end on the peak frames
    if frame in (2, 3, 4):
        fx, fy = tip_pts[-1]
        rad = 4 + (frame == 3) * 2
        d.ellipse([fx - rad, fy - rad * G.SQUASH, fx + rad, fy + rad * G.SQUASH],
                  fill=G.STORM_B)
        d.ellipse([fx - rad * 0.5, fy - rad * 0.5 * G.SQUASH,
                   fx + rad * 0.5, fy + rad * 0.5 * G.SQUASH], fill=G.STORM_W)

    # muzzle glow at the nose
    mx, my = G.P(ox, oy, h, NOSE_F, 0, lift)
    d.ellipse([mx - 3, my - 2, mx + 3, my + 2], fill=G.STORM_B)
    d.ellipse([mx - 1.5, my - 1, mx + 1.5, my + 1], fill=G.STORM_W)


def draw_attack_cell(d, ox, oy, h, frame, seed):
    rec = RECOIL.get(frame, 0.0)
    bx, by = G.rot(-rec, 0, h)
    ox2 = ox + bx * G.SCALE
    oy2 = oy + by * G.SQUASH * G.SCALE
    G.draw_petrel(d, ox2, oy2, h, 0, False)
    storm_arc(d, ox2, oy2, h, frame, seed)


if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # Each cell is drawn on its own 150px tile and composited in, so no arc can
    # ever bleed into a neighbouring state/frame cell (the in-game overlay shows
    # exactly one cell, and anything painted outside it pollutes other states).
    for row in range(ROWS):
        for col in range(COLS):
            tile = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            td = ImageDraw.Draw(tile)
            draw_attack_cell(td, CELL//2, 73, HEADINGS[col], row, seed=col)
            img.alpha_composite(tile, (col*CELL, row*CELL))

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/attack/petrel-stormrider.png"
    img.save(out)
    print("wrote", out, img.size)
