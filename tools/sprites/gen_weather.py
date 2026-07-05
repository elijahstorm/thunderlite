#!/usr/bin/env python3
"""Weather (sky layer) sprite sheets — Cloud, Storm, Turbulence, Ash Plume, Jetstream.

Each sheet is 60x300: five 60x60 frames stacked vertically, cycled by the slow
200ms board clock. The old cloud/storm frames were five *different* cloud
paintings, so the loop strobed at 5fps. Here every frame is the SAME weather
mass with subtle cyclic motion (blobs drift on a sine phase that completes one
full loop over the 5 frames), so the animation reads as a gentle churn instead
of a flicker.

Style: flat 3-tone fills with a soft darker underside, matching the roster's
flat-fill look rather than airbrushed gradients. Sky tiles draw ABOVE units at
full alpha, so cores stay mostly solid (concealment should look like
concealment) with feathered edges.
"""
import math
import random
import sys, os
from PIL import Image, ImageDraw

CELL = 60
FRAMES = 5
OUT = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/weather"

# palettes anchored to the existing art
CLOUD_LO = (222, 214, 196, 200)   # underside shadow
CLOUD_MD = (247, 240, 219, 209)   # body (sampled from current sheet)
CLOUD_HI = (255, 252, 238, 214)   # sunlit top
STORM_LO = (62, 74, 92, 246)      # deep slate base
STORM_MD = (96, 118, 138, 244)    # body (near current 83,118,138)
STORM_HI = (140, 150, 160, 240)   # lit crown (current 156 grey)
RAIN     = (190, 210, 228, 170)
ASH_LO   = (58, 48, 46, 242)      # volcano-dark base
ASH_MD   = (92, 78, 72, 238)
ASH_HI   = (128, 112, 102, 232)
EMBER    = (255, 140, 60, 210)
WIND     = (222, 230, 236, 150)   # turbulence streaks
WIND_HI  = (250, 252, 255, 190)
JET      = (196, 226, 240, 140)   # jetstream flow lines
JET_HI   = (236, 248, 255, 185)


def phase(frame, offset=0.0):
    """0..2pi, completing exactly one cycle across the 5 frames (seamless loop)."""
    return (frame / FRAMES) * 2 * math.pi + offset


def blob(d, x, y, rx, ry, color):
    d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=color)


def make_sheet(draw_frame):
    img = Image.new("RGBA", (CELL, CELL * FRAMES), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for f in range(FRAMES):
        draw_frame(d, 30, f * CELL + 30, f)
    return img


# --- cumulus mass shared by Cloud / Storm / Ash (same bones, different skins) ---
# (dx, dy, rx, ry, drift-phase-offset): one coherent mass, slightly widescreen so
# adjacent weather tiles knit into a band instead of reading as separate balls.
PUFFS = [
    (-16, 6, 11, 7, 0.0),
    (-6, -2, 12, 8, 1.3),
    (6, -4, 12, 8, 2.9),
    (16, 4, 11, 7, 4.1),
    (0, 7, 15, 8, 5.2),
    (-11, -7, 8, 6, 2.2),
    (11, -8, 8, 6, 3.7),
]


def cumulus(d, cx, cy, frame, lo, md, hi, wobble=1.2):
    # underside shadow pass (whole mass, shifted down)
    for dx, dy, rx, ry, po in PUFFS:
        ox = math.sin(phase(frame, po)) * wobble
        oy = math.cos(phase(frame, po)) * wobble * 0.4
        blob(d, cx + dx + ox, cy + dy + oy + 2.5, rx, ry, lo)
    # body pass
    for dx, dy, rx, ry, po in PUFFS:
        ox = math.sin(phase(frame, po)) * wobble
        oy = math.cos(phase(frame, po)) * wobble * 0.4
        blob(d, cx + dx + ox, cy + dy + oy, rx, ry - 0.5, md)
    # sunlit crowns on the upper puffs only
    for dx, dy, rx, ry, po in PUFFS:
        if dy > 0:
            continue
        ox = math.sin(phase(frame, po)) * wobble
        oy = math.cos(phase(frame, po)) * wobble * 0.4
        blob(d, cx + dx + ox - 1, cy + dy + oy - 2.5, rx * 0.62, ry * 0.5, hi)


def draw_cloud(d, cx, cy, frame):
    cumulus(d, cx, cy, frame, CLOUD_LO, CLOUD_MD, CLOUD_HI)


def draw_storm(d, cx, cy, frame):
    cumulus(d, cx, cy - 3, frame, STORM_LO, STORM_MD, STORM_HI)
    # rain: short slanted dashes falling below the base, offset scrolls with the
    # loop so the fall reads continuous (positions wrap, never pop)
    rng = random.Random(7)
    for i in range(7):
        x0 = -22 + i * 7 + rng.uniform(-1.5, 1.5)
        speed = 10
        y0 = ((rng.uniform(0, 10) + (frame / FRAMES) * speed) % 10) + 8
        d.line(
            [cx + x0, cy + y0, cx + x0 - 1.6, cy + y0 + 4],
            fill=RAIN,
            width=1,
        )
    # dim inner glow that breathes with the loop (menace without a strobe).
    # OPAQUE lightened tone, not low-alpha over the body: ImageDraw overwrites
    # pixels, so a translucent blob would punch a hole in the cloud.
    glow = 6 + 2 * math.sin(phase(frame))
    blob(d, cx + 2, cy - 2, glow, glow * 0.45, (118, 138, 158, STORM_MD[3]))


def draw_turbulence(d, cx, cy, frame):
    # mostly-open tile: three horizontal shear arcs, each rippling on the loop
    for i, (yy, po, ln) in enumerate([(-10, 0.0, 20), (0, 2.1, 24), (10, 4.2, 18)]):
        pts = []
        for k in range(13):
            t = k / 12
            x = cx - ln + t * ln * 2
            y = cy + yy + math.sin(t * math.pi * 2 + phase(frame, po)) * 3.2
            pts.append((x, y))
        d.line(pts, fill=WIND, width=2, joint="curve")
        # bright leading curl that travels along the arc and wraps
        head = (frame / FRAMES + i / 3) % 1.0
        hx = cx - ln + head * ln * 2
        hy = cy + yy + math.sin(head * math.pi * 2 + phase(frame, po)) * 3.2
        d.line([hx - 3, hy, hx + 3, hy], fill=WIND_HI, width=2)
        blob(d, hx + 3, hy, 1.4, 1.4, WIND_HI)


def draw_ash(d, cx, cy, frame):
    # billowing column: same cumulus bones, sootier skin, slow upward roll
    rise = math.sin(phase(frame)) * 0.8
    cumulus(d, cx, cy - rise, frame, ASH_LO, ASH_MD, ASH_HI, wobble=1.5)
    # ember flecks winking on the loop. Brightness (not alpha) breathes, and the
    # fleck stays opaque so it doesn't punch a pinhole through the ash body.
    rng = random.Random(3)
    for i in range(5):
        ex = cx + rng.uniform(-16, 16)
        ey = cy + rng.uniform(-4, 10)
        a = 0.5 + 0.5 * math.sin(phase(frame, i * 1.7))
        col = (
            int(120 + (EMBER[0] - 120) * a),
            int(60 + (EMBER[1] - 60) * a),
            int(45 + (EMBER[2] - 45) * a),
            ASH_MD[3],
        )
        blob(d, ex, ey, 1.1, 1.1, col)


# --- Jetstream: a DIRECTIONAL, autotiling flow (the sky highway). Unlike the
# amorphous weathers, the jetstream sheet is a grid of 16 connection states
# (columns) x 5 animation frames (rows). The sky autotiler picks the column from
# a tile's same-type neighbours (identical rollDecision scheme to roads/canyons),
# so a run of tiles reads as ONE flowing current that turns corners, runs
# vertically and branches at junctions — not the same horizontal streak on every
# tile. Within each state, comet streaks scroll along flow lanes routed between
# the connected edges, and loop seamlessly (one dash period over the 5 frames).
# Lanes cross each edge at fixed offsets (18/30/42 px), so a straight tile, a
# corner and a T all line up edge-to-edge and knit into a continuous highway.
JET_STATE_SIDES = {
    0: "", 1: "L", 2: "LR", 3: "LU", 4: "LUD", 5: "LURD", 6: "LUR", 7: "URD",
    8: "LRD", 9: "UR", 10: "RD", 11: "LD", 12: "UD", 13: "U", 14: "R", 15: "D",
}
JET_PERIOD = 20
JET_STREAK = 12
JET_LANE_OFF = (-12, 0, 12)
JET_DIM = (JET[0], JET[1], JET[2], 70)
JET_EDGE = {
    "L": lambda o: (0, 30 + o),
    "R": lambda o: (60, 30 + o),
    "U": lambda o: (30 + o, 0),
    "D": lambda o: (30 + o, 60),
}


def _bezier(p0, p1, p2, n=18):
    out = []
    for k in range(n + 1):
        t = k / n
        out.append((
            (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
            (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
        ))
    return out


def _cum(pts):
    c = [0.0]
    for i in range(1, len(pts)):
        c.append(c[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return c


def _pt(pts, cum, s):
    if s <= 0:
        return pts[0]
    if s >= cum[-1]:
        return pts[-1]
    for i in range(1, len(cum)):
        if cum[i] >= s:
            t = (s - cum[i - 1]) / max(1e-6, cum[i] - cum[i - 1])
            return (pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
                    pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t)
    return pts[-1]


def _seg(d, pts, cum, s0, s1, xb, yb, color, width):
    s0 = max(0.0, s0)
    s1 = min(cum[-1], s1)
    if s1 <= s0:
        return
    steps = max(2, int((s1 - s0) / 2) + 1)
    poly = []
    for k in range(steps + 1):
        s = s0 + (s1 - s0) * k / steps
        x, y = _pt(pts, cum, s)
        poly.append((xb + x, yb + y))
    d.line(poly, fill=color, width=width)


def _flow(d, pts, xb, yb, scroll):
    # comet train scrolling along the lane; loops seamlessly because the train is
    # periodic and the scroll advances exactly one period over the 5 frames.
    cum = _cum(pts)
    L = cum[-1]
    if L <= 0:
        return
    j = -1
    while True:
        head = scroll + j * JET_PERIOD
        if head - JET_STREAK > L:
            break
        _seg(d, pts, cum, head - JET_STREAK, head - JET_STREAK * 0.5, xb, yb, JET_DIM, 1)
        _seg(d, pts, cum, head - JET_STREAK * 0.5, head - JET_STREAK * 0.18, xb, yb, JET, 2)
        _seg(d, pts, cum, head - JET_STREAK * 0.18, head, xb, yb, JET_HI, 2)
        if 0 <= head <= L:
            hp = _pt(pts, cum, head)
            blob(d, xb + hp[0], yb + hp[1], 1.6, 1.4, JET_HI)
        j += 1


def _jet_lanes(sides):
    """Flow-lane polylines (unit-cell coords) for a connection state."""
    L, U, R, D = (c in sides for c in "LURD")
    lanes = []
    h_straight = L and R
    v_straight = U and D
    if h_straight:
        for o in JET_LANE_OFF:
            lanes.append([(0, 30 + o), (60, 30 + o)])
    if v_straight:
        for o in JET_LANE_OFF:
            lanes.append([(30 + o, 0), (30 + o, 60)])
    h_side = "L" if (L and not h_straight) else ("R" if (R and not h_straight) else None)
    v_side = "U" if (U and not v_straight) else ("D" if (D and not v_straight) else None)
    if h_side and v_side:  # corner: a broad sweeping turn between the two edges
        for o in JET_LANE_OFF:
            p0 = JET_EDGE[h_side](o)  # (edge x, 30+o)
            p2 = JET_EDGE[v_side](o)  # (30+o, edge y)
            # Control at the tangent intersection (vertical-edge x, horizontal-edge
            # y): the curve leaves the horizontal edge moving horizontally and
            # meets the vertical edge moving vertically, bulging toward the tile
            # interior. A generous, legible arc instead of a tight hug of the corner.
            lanes.append(_bezier(p0, (p2[0], p0[1]), p2))
    elif h_side:  # lone horizontal side: branch/cap stub edge -> hub
        for o in JET_LANE_OFF:
            lanes.append([JET_EDGE[h_side](o), (30, 30 + o)])
    elif v_side:  # lone vertical side
        for o in JET_LANE_OFF:
            lanes.append([JET_EDGE[v_side](o), (30 + o, 30)])
    elif not (L or U or R or D):  # isolated: a small swirl at the hub
        ring = [(30 + 9 * math.cos(k / 12 * 2 * math.pi), 30 + 6 * math.sin(k / 12 * 2 * math.pi))
                for k in range(13)]
        lanes.append(ring)
    return lanes


def draw_jetstream_state(d, cx, cy, frame, state):
    xb, yb = cx - 30, cy - 30
    scroll = (frame / FRAMES) * JET_PERIOD
    for i, lane in enumerate(_jet_lanes(JET_STATE_SIDES[state])):
        cum = _cum(lane)
        # continuous faint guide along the whole lane -> seamless tile-to-tile knit
        _seg(d, lane, cum, 0, cum[-1], xb, yb, JET_DIM, 1)
        # stagger alternate lanes half a period for a woven, sheared flow
        _flow(d, lane, xb, yb, scroll + (i % 2) * (JET_PERIOD / 2))


def make_jetstream_sheet():
    states = len(JET_STATE_SIDES)
    img = Image.new("RGBA", (CELL * states, CELL * FRAMES), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for st in range(states):
        for f in range(FRAMES):
            draw_jetstream_state(d, st * CELL + 30, f * CELL + 30, f, st)
    return img


# Amorphous weathers: one column (state 0), five animation rows -> 60x300.
SHEETS = {
    "cloud.png": draw_cloud,
    "storm.png": draw_storm,
    "turbulence.png": draw_turbulence,
    "ash-plume.png": draw_ash,
}

if __name__ == "__main__":
    for name, fn in SHEETS.items():
        img = make_sheet(fn)
        path = os.path.join(OUT, name)
        img.save(path)
        print("wrote", path, img.size)
    # Jetstream autotiles: 16 connection states (columns) x 5 frames (rows).
    js = make_jetstream_sheet()
    js_path = os.path.join(OUT, "jetstream.png")
    js.save(js_path)
    print("wrote", js_path, js.size)
