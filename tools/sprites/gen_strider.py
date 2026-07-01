#!/usr/bin/env python3
"""Strider — elite legged sniper-scout WALKER mech. Idle sheet.

The ONLY legged and ONLY tall unit in the roster, so its silhouette has to read
instantly as different: a compact armored cockpit pod sitting HIGH on thin
articulated bird/insect legs, with a long railgun cannon protruding forward and a
glowing scope eye. It must tower ABOVE where the other units sit.

Drawing technique follows gen_outrider.py exactly:
  * the mech is ONE coherent shape, not a pile of outlined boxes
  * 2.5D fake: top-down footprint vertically SQUASHED for camera tilt, plus a
    dark extruded side-wall (LIFT) so solid parts have real thickness
  * light comes from the top-right
The new twist vs a ground vehicle: parts live at different HEIGHTS above the
ground (the legs lift the pod way up), expressed through the `lift` argument —
exactly the same screen math the buggy used for its mast/antenna, just used a lot
more so the body floats high over the foot ellipses.

Cell is TALL: 60w x 120h, 6 state columns x 4 rows -> 360x480. yOffset 60 in
unit.ts so the sprite rises above its tile. The mech occupies the lower-center;
legs plant near the bottom, pod + cannon reach up into the top of the cell.
"""
import math
import sys, os
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
from lighting import relight

CELL_W, CELL_H, COLS, ROWS = 60, 120, 6, 4
W, H = CELL_W * COLS, CELL_H * ROWS

# palette sampled from the roster (shared so it blends in)
OUTLINE  = (28, 29, 39)
BODY     = (233, 51, 46)     # armor red
BODY_HI  = (255, 144, 133)   # pink highlight
HULL     = (170, 22, 44)     # dark-red side walls
HULL_LO  = (120, 18, 40)     # deepest shade
UNDER    = (102, 26, 94)     # purple recesses / joints
METAL    = (82, 75, 72)      # gunmetal (legs, barrel)
METAL_HI = (172, 164, 156)   # lit metal
METAL_LO = (54, 49, 47)      # leg shadow side
WHITE    = (255, 255, 255)
# ONE accent: cyan sensor/scope glow (the sniper "eye")
EYE      = (90, 230, 240)
EYE_HI   = (210, 255, 255)
EYE_LO   = (40, 150, 180)

# 6 columns: walk-right, walk-down, walk-left, walk-up, stand-right, stand-left.
# h=0 -> facing screen-up (north/away); +90 -> facing screen-right (east).
STATES = [(90, True), (180, True), (270, True), (0, True), (90, False), (270, False)]

SQUASH = 0.62     # vertical compression = camera tilt
SCALE  = 1.80     # overall size in the cell
GROUND = 0        # foot plane lift reference

def rot(f, r, h):
    """local forward/right -> screen dx,dy at heading h (before tilt)."""
    a = math.radians(h)
    return (f * math.sin(a) + r * math.cos(a), -f * math.cos(a) + r * math.sin(a))

def P(cx, cy, h, f, r, lift=0.0):
    """project local (forward, right, height) to a screen point.
    `lift` is height above the ground plane — pixels straight UP on screen."""
    dx, dy = rot(f, r, h)
    return (cx + dx * SCALE, cy + (dy * SQUASH - lift) * SCALE)

def poly(d, cx, cy, h, pts, fill, lift=0.0, outline=None):
    d.polygon([P(cx, cy, h, f, r, lift) for f, r in pts], fill=fill, outline=outline)

def line(d, cx, cy, h, a, b, fill, lift_a=0.0, lift_b=None, width=1):
    lb = lift_a if lift_b is None else lift_b
    d.line([P(cx, cy, h, *a, lift_a), P(cx, cy, h, *b, lb)], fill=fill, width=width)

def disc(d, cx, cy, h, f, r, rad, fill, lift=0.0, outline=None):
    x, y = P(cx, cy, h, f, r, lift)
    rx, ry = rad * SCALE, rad * SQUASH * SCALE
    d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=fill, outline=outline)

def vbox(d, cx, cy, h, pts, base, top, fill_top, fill_wall, outline=None):
    """A raised slab: extrude the footprint `pts` from height `base` up to `top`,
    then cap it. Reads as a solid 3D block (same trick the buggy used for LIFT)."""
    n = max(1, int(round(top - base)))
    for i in range(n + 1):
        lv = base + (top - base) * i / n
        shade = fill_wall if i < n * 0.55 else fill_top
        poly(d, cx, cy, h, pts, shade, lift=lv)
    poly(d, cx, cy, h, pts, fill_top, lift=top, outline=outline)


# ---- footprints / heights (local forward,right; lift = up) -------------------
# The pod sits high; legs reach from the pod hips down to splayed feet.
POD_BASE = 16.0          # underside of the cockpit pod
POD_TOP  = 23.0          # top of the pod
# pod footprint: a compact rounded armored block, nose slightly pointed forward
POD_PTS = [(6.5, 0), (5.0, -5.2), (-4.5, -5.6), (-6.0, 0), (-4.5, 5.6), (5.0, 5.2)]
POD_DECK = [(4.5, 0), (3.3, -4.0), (-3.6, -4.3), (-4.8, 0), (-3.6, 4.3), (3.3, 4.0)]

# the four leg anchor points on the pod (hips) and their nominal foot spots
# front-pair forward, rear-pair back; right/left split for the splay
HIPS = {
    'FR': (4.5, -4.5), 'FL': (4.5, 4.5),
    'RR': (-4.5, -4.5), 'RL': (-4.5, 4.5),
}
# resting foot position (forward, right) on the ground for each leg
FEET = {
    'FR': (10.0, -7.0), 'FL': (10.0, 7.0),
    'RR': (-8.0, -7.5), 'RL': (-8.0, 7.5),
}


def draw_leg(d, cx, cy, h, hip, foot, knee_h, lift_foot, fr_split=0.0):
    """Draw one articulated insect/bird leg: hip -> knee (raised) -> foot.
    Three thin gunmetal segments with an outlined silhouette so it reads as a
    spindly limb, not a box. `lift_foot` lets a foot lift during a step."""
    hf, hr = hip
    ff, fr = foot
    fr += fr_split            # splay outward for the down/up facings
    # knee sits between hip and foot, kicked OUTWARD and UP (bird-like reverse joint)
    kf = (hf + ff) * 0.5 + (1.6 if ff > hf else -1.6)
    kr = (hr + fr) * 0.5 + (1.4 if fr >= 0 else -1.4)
    kh = knee_h

    hip_p  = (hf, hr, POD_BASE + 0.5)
    knee_p = (kf, kr, kh)
    foot_p = (ff, fr, GROUND + lift_foot)

    # foot shadow on the ground (only when planted)
    if lift_foot < 0.6:
        disc(d, cx, cy, h, ff, fr, 1.7, (0, 0, 0, 70), lift=0.2)

    # thigh (hip->knee) and shin (knee->foot) as outlined capsule-ish lines
    def seg(p0, p1, w, col):
        a = P(cx, cy, h, p0[0], p0[1], p0[2])
        b = P(cx, cy, h, p1[0], p1[1], p1[2])
        d.line([a, b], fill=OUTLINE, width=w + 2)
        d.line([a, b], fill=col, width=w)

    seg(hip_p, knee_p, 3, METAL)
    seg(knee_p, foot_p, 2, METAL_LO)
    # lit edge on the thigh (light from top-right)
    a = P(cx, cy, h, hip_p[0], hip_p[1], hip_p[2] + 0.4)
    b = P(cx, cy, h, knee_p[0], knee_p[1], knee_p[2] + 0.4)
    d.line([a, b], fill=METAL_HI, width=1)

    # knee joint
    disc(d, cx, cy, h, kf, kr, 1.5, OUTLINE, lift=kh)
    disc(d, cx, cy, h, kf, kr, 1.0, METAL_HI, lift=kh)
    # clawed foot tip
    disc(d, cx, cy, h, ff, fr, 1.3, OUTLINE, lift=GROUND + lift_foot)
    disc(d, cx, cy, h, ff, fr, 0.8, METAL, lift=GROUND + lift_foot)


def draw_strider(d, cx, cy, h, frame, moving):
    # which legs are mid-step this frame (diagonal gait); only while walking
    # step cycle over 4 frames: lift FR+RL, then FL+RR
    if moving:
        step = [0.0, 2.6, 0.0, 2.6][frame]
        phaseA = frame in (1,)        # FR, RL up
        phaseB = frame in (3,)        # FL, RR up
    else:
        step = 0.0
        phaseA = phaseB = False
    # subtle body bob tied to the gait
    bob = [0.0, -0.8, 0.0, -0.8][frame] if moving else [0.0, -0.4, 0.0, -0.4][frame]

    # splay legs outward for the toward/away facings so the stance reads wide
    # (more lateral spread when walking straight up/down the screen)
    splay = 1.6 if h in (0, 180) else 0.0

    lift = {'FR': 0.0, 'FL': 0.0, 'RR': 0.0, 'RL': 0.0}
    if phaseA:
        lift['FR'] = step; lift['RL'] = step
    if phaseB:
        lift['FL'] = step; lift['RR'] = step

    # --- BACK legs first (drawn behind the pod): rear pair --------------------
    # painter's order: legs whose feet are further "back/up" the screen first.
    # Simplest robust order: draw all legs, then the pod over their tops, then
    # re-draw the front leg lower segments so they cross in front of the pod.
    leg_order = ['RR', 'RL', 'FR', 'FL']
    knee_heights = {'FR': 11.0, 'FL': 11.0, 'RR': 11.5, 'RL': 11.5}
    for name in leg_order:
        hip = HIPS[name]
        foot = FEET[name]
        sp = 0.0
        if name in ('FR', 'RR'):
            sp = -splay
        elif name in ('FL', 'RL'):
            sp = +splay
        draw_leg(d, cx, cy + bob, h, hip, foot, knee_heights[name], lift[name], sp)

    pcy = cy + bob

    # --- the cockpit POD: a solid armored block raised on the legs ------------
    poly(d, cx, pcy, h, POD_PTS, OUTLINE, lift=POD_BASE)             # underside drop
    vbox(d, cx, pcy, h, POD_PTS, POD_BASE, POD_TOP, BODY, HULL, outline=OUTLINE)
    # deck inset + highlight spine
    poly(d, cx, pcy, h, POD_DECK, BODY, lift=POD_TOP)
    poly(d, cx, pcy, h, [(3.5, 0), (2.5, -2.6), (-3.0, -2.8), (-3.8, 0),
                         (-3.0, 2.8), (2.5, 2.6)], BODY_HI, lift=POD_TOP)
    # rear half shaded
    poly(d, cx, pcy, h, [(-1.0, -4.0), (-4.8, 0), (-1.0, 4.0), (0.5, 0)],
         HULL, lift=POD_TOP)
    # side rails (lit top-right, shaded bottom-left)
    line(d, cx, pcy, h, (4.5, -5.0), (-5.5, -4.0), BODY_HI, POD_TOP)
    line(d, cx, pcy, h, (4.5, 5.0), (-5.5, 4.0), HULL_LO, POD_TOP)
    # armor seam + purple vent at the hip line
    poly(d, cx, pcy, h, [(1.0, -5.4), (1.0, 5.4), (-1.5, 5.4), (-1.5, -5.4)],
         UNDER, lift=POD_BASE + 1.0)
    # shoulder pylons (where the cannon mounts) raised a touch on the nose
    vbox(d, cx, pcy, h, [(6.5, -3.0), (6.5, 3.0), (3.0, 3.0), (3.0, -3.0)],
         POD_TOP, POD_TOP + 1.6, BODY_HI, HULL, outline=OUTLINE)

    # --- long railgun SNIPER cannon protruding forward, slightly raised -------
    gun_h = POD_TOP + 0.6
    # barrel as a thick outlined segment from the pylons out past the nose. Kept
    # from overhanging the tile into the neighbouring sheet cell (shorter reach).
    bx0 = P(cx, pcy, h, 4.0, 0, gun_h)
    bx1 = P(cx, pcy, h, 14.0, 0, gun_h)
    d.line([bx0, bx1], fill=OUTLINE, width=5)
    d.line([bx0, bx1], fill=METAL, width=3)
    # lit top edge of the barrel
    bx0h = P(cx, pcy, h, 4.0, 0, gun_h + 0.7)
    bx1h = P(cx, pcy, h, 14.0, 0, gun_h + 0.7)
    d.line([bx0h, bx1h], fill=METAL_HI, width=1)
    # rail rings / coils along the barrel (railgun look)
    for rf in (6.0, 9.0, 12.0):
        disc(d, cx, pcy, h, rf, 0, 1.6, OUTLINE, lift=gun_h)
        disc(d, cx, pcy, h, rf, 0, 1.1, METAL_HI, lift=gun_h)
        disc(d, cx, pcy, h, rf, 0, 0.5, UNDER, lift=gun_h)
    # muzzle brake at the tip
    disc(d, cx, pcy, h, 13.6, 0, 1.7, OUTLINE, lift=gun_h)
    disc(d, cx, pcy, h, 13.6, 0, 1.1, METAL, lift=gun_h)
    disc(d, cx, pcy, h, 14.3, 0, 0.5, OUTLINE, lift=gun_h)

    # --- scope / sensor EYE on top of the pod, cyan, pulses over 4 frames -----
    pulse = [1.0, 0.62, 1.0, 0.62][frame]
    eye_h = POD_TOP + 1.4
    # scope housing
    disc(d, cx, pcy, h, 1.5, 0, 3.0, OUTLINE, lift=eye_h)
    disc(d, cx, pcy, h, 1.5, 0, 2.4, METAL_LO, lift=eye_h)
    # glowing lens, brightness pulses
    g = tuple(int(EYE_LO[i] + (EYE[i] - EYE_LO[i]) * pulse) for i in range(3))
    disc(d, cx, pcy, h, 1.7, 0, 1.7, g, lift=eye_h + 0.2)
    if pulse > 0.8:
        disc(d, cx, pcy, h, 1.7, 0, 2.2, (EYE[0], EYE[1], EYE[2], 90), lift=eye_h + 0.2)
    disc(d, cx, pcy, h, 1.2, -0.6, 0.7, EYE_HI, lift=eye_h + 0.4)

    # --- rear sensor fin / antenna so the back reads tall & techy -------------
    f0 = P(cx, pcy, h, -5.0, -2.0, POD_TOP)
    f1 = P(cx, pcy, h, -6.5, -2.0, POD_TOP + 6.0)
    d.line([f0, f1], fill=OUTLINE, width=3)
    d.line([f0, f1], fill=METAL, width=1)
    disc(d, cx, pcy, h, -6.5, -2.0, 0.9, EYE, lift=POD_TOP + 6.0)
    # small purple heat-sink on the rear deck
    poly(d, cx, pcy, h, [(-3.0, 1.5), (-4.6, 1.5), (-4.6, 4.0), (-3.0, 4.0)],
         UNDER, lift=POD_TOP, outline=OUTLINE)


if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    for row in range(ROWS):
        for col in range(COLS):
            h, moving = STATES[col]
            # center horizontally; sit low in the cell so legs plant near bottom
            ox = col * CELL_W + CELL_W // 2
            oy = row * CELL_H + CELL_H - 30
            draw_strider(d, ox, oy, h, row, moving)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/idle/strider.png"
    img.save(out)
    print("wrote", out, img.size)
