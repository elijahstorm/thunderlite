#!/usr/bin/env python3
"""Strider attack sheet: charge-up then railgun snipe.

150px cells, 4 state columns (right/down/left/up) x 8 animation rows -> 600x1200,
drawn with xOffset/yOffset 45 in unit.ts. The mech is drawn at the SAME visual
scale as the idle sheet (it must NOT grow) and centered; the firing effect lives
in the generous margins.

8-frame beat:
  0-2  charge: the scope eye and the railgun coils glow brighter, a thin energy
        wisp gathers at the muzzle
  3    FIRE: brilliant muzzle/railgun flash + a long thin beam, peak recoil
  4    afterflash, beam fading
  5-7  settle: recoil eases back, glow returns to idle

Reuses the idle generator's drawing code so the mech stays identical.
"""
import math, os, sys
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(__file__))
import gen_strider as G
from lighting import relight

CELL = 150
COLS, ROWS = 4, 8
W, H = CELL * COLS, CELL * ROWS
HEADINGS = [90, 180, 270, 0]            # right, down, left, up

# recoil (backward kick along -forward) and charge/flash intensity per frame
RECOIL = {3: 3.2, 4: 2.0, 5: 1.0, 6: 0.4}
CHARGE = {0: 0.25, 1: 0.55, 2: 0.85}    # gathering glow at muzzle (fraction)
FLASH  = {3: 1.0, 4: 0.5}               # full muzzle blast
BEAM   = {3: 1.0, 4: 0.45}              # railgun beam strength


def glow_dot(d, x, y, rad, col, a):
    d.ellipse([x - rad, y - rad * G.SQUASH, x + rad, y + rad * G.SQUASH],
              fill=(col[0], col[1], col[2], a))


def charge_fx(d, ox, oy, h, frac):
    """Energy gathering at the muzzle while charging: cyan wisps + brighter eye."""
    mf = 14.0
    mx, my = G.P(ox, oy, h, mf, 0, lift=G.POD_TOP + 0.6)
    # converging sparks from around the muzzle
    for ang in range(0, 360, 60):
        a = math.radians(ang)
        dist = 6.0 * (1.0 - frac) + 2.0
        sx = mx + math.cos(a) * dist
        sy = my + math.sin(a) * dist * G.SQUASH
        d.line([sx, sy, mx, my], fill=(G.EYE[0], G.EYE[1], G.EYE[2],
                int(140 * frac)), width=1)
    glow_dot(d, mx, my, 1.5 + 2.5 * frac, G.EYE, int(150 * frac))
    glow_dot(d, mx, my, 0.8 + 1.2 * frac, G.EYE_HI, int(210 * frac))


def railgun_blast(d, ox, oy, h, fl, beam):
    """Bright muzzle flash + a long thin railgun beam down the barrel line."""
    gh = G.POD_TOP + 0.6
    mx, my = G.P(ox, oy, h, 14.0, 0, lift=gh)
    # long beam shooting forward
    if beam > 0:
        bx, by = G.P(ox, oy, h, 14.0 + 70.0, 0, lift=gh)
        d.line([mx, my, bx, by], fill=(G.EYE_HI[0], G.EYE_HI[1], G.EYE_HI[2],
                int(230 * beam)), width=max(1, int(4 * beam)))
        d.line([mx, my, bx, by], fill=(255, 255, 255, int(255 * beam)),
               width=max(1, int(2 * beam)))
        # crackle along the beam
        for t in (0.3, 0.55, 0.8):
            jx = mx + (bx - mx) * t
            jy = my + (by - my) * t
            off = (4 if int(t * 10) % 2 else -4) * beam
            d.line([jx, jy, jx + off * 0.4, jy + off],
                   fill=(G.EYE[0], G.EYE[1], G.EYE[2], int(200 * beam)), width=1)
    # muzzle flash: radiating spikes + bright core
    if fl > 0:
        size = 9.0 * fl
        for ang in range(0, 360, 30):
            a = math.radians(ang)
            ln = size * (1.4 if ang % 90 == 0 else 0.7)
            d.line([mx, my, mx + math.cos(a) * ln, my + math.sin(a) * ln * G.SQUASH],
                   fill=(235, 250, 255, int(230 * fl)), width=1)
        glow_dot(d, mx, my, size * 0.75, G.EYE, int(220 * fl))
        glow_dot(d, mx, my, size * 0.45, (235, 250, 255), int(255 * fl))
        glow_dot(d, mx, my, size * 0.22, (255, 255, 255), 255)


def draw_attack_cell(d, ox, oy, h, frame):
    rec = RECOIL.get(frame, 0.0)
    bx, by = G.rot(-rec, 0, h)
    ox2 = ox + bx * G.SCALE
    oy2 = oy + by * G.SQUASH * G.SCALE

    # charge wisps gather BEFORE the body (behind the muzzle tip)
    if frame in CHARGE:
        charge_fx(d, ox2, oy2, h, CHARGE[frame])

    # planted stance, no walk bob/step; pump the scope glow during charge+fire
    glow_frame = 0 if frame in (0, 2, 4, 6) else 0   # keep eye lit (frame 0 = bright)
    G.draw_strider(d, ox2, oy2, h, 0, False)

    # blast on top
    railgun_blast(d, ox2, oy2, h, FLASH.get(frame, 0.0), BEAM.get(frame, 0.0))


if __name__ == "__main__":
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    for row in range(ROWS):
        for col in range(COLS):
            # center; nudge down so the tall mech sits in the cell, effect above
            ox = col * CELL + CELL // 2
            oy = row * CELL + CELL // 2 + 26
            draw_attack_cell(d, ox, oy, HEADINGS[col], row)

    relight(img)
    out = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/unit/attack/strider.png"
    img.save(out)
    print("wrote", out, img.size)
