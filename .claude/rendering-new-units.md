# Thunderlite Sprite Rendering Recipe

## 0. Where things live
- Generators: tools/sprites/gen_<unit>.py (idle) and gen_<unit>_attack.py (attack)
- Shared relighting: tools/sprites/lighting.py
- Output idle:   static/game/play/unit/idle/<unit>.png
- Output attack: static/game/play/unit/attack/<unit>.png
- Run with: python3 tools/sprites/gen_<unit>.py   (uses PIL/Pillow)

## 1. The core 2.5D technique (NOT a 3D box compositor)
Draw ONE coherent top-down silhouette, then fake the camera:
  1. SQUASH the whole drawing vertically (0.62) to fake the camera tilt.
  2. Extrude a solid dark side-wall downward under the deck (LIFT) so the hull
     has real thickness -> reads "viewed from above-front, top-right".
  3. SCALE up to fill the cell (per-unit, ~1.4-1.8) to match roster footprint.
Do NOT outline every face / axis-aligned rect per face -> that gives the
"nonsensical red squares" failure. Keep it a single squashed shape + extrusion.

## 2. Projection math (copy into every generator)
    SQUASH = 0.62      # vertical compression = camera tilt
    LIFT   = <hull height>   # extrusion depth (squat unit = smaller)
    SCALE  = <per-unit>      # fill the 60px cell

    def rot(f, r, h):        # f=forward, r=right, h=heading degrees
        a = math.radians(h)
        return (f*math.sin(a) + r*math.cos(a), -f*math.cos(a) + r*math.sin(a))

    def P(cx, cy, h, f, r, lift=0.0):
        dx, dy = rot(f, r, h)
        return (cx + dx*SCALE, cy + (dy*SQUASH - lift)*SCALE)
- h=0   -> nose points screen-UP (north)
- h=90  -> nose points screen-RIGHT (east)
- Extrude by looping lift 0..LIFT, drawing the same footprint each step
  (darker HULL_LO for the lower half, HULL for the upper), then the deck top
  at lift=LIFT with the outline.

## 3. Shared palette (sampled from roster, do not invent new hues)
    OUTLINE  (28,29,39)     BODY     (233,51,46)    BODY_HI (255,144,133)
    HULL     (170,22,44)    HULL_LO  (120,18,40)    UNDER   (102,26,94)
    METAL    (82,75,72)     METAL_HI (172,164,156)  WHITE   (255,255,255)

## 4. Idle sheet layout (6 states x 4 anim rows)
- Cell 60x60 -> sheet 360x240.
- Columns (left->right): walk-right(h=90), walk-down(h=180), walk-left(h=270),
  walk-up(h=0), stand-right(h=90 no motion), stand-left(h=270 no motion).
      STATES = [(90,True),(180,True),(270,True),(0,True),(90,False),(270,False)]
- Rows = 4 animation frames. Add a subtle bob: cy += [0,-1,0,1][frame]*0.5
- Tread/leg cleats slide by frame only when moving.

## 5. TALL units (top would be cut off — Aegis, Shroud)
- Use CELL_W, CELL_H = 60, 120  -> sheet 360x480.
- Draw the body low in the cell: at row*CELL_H + 90.
- In unit.ts set  yOffset: 60  so the sprite overflows ABOVE its tile.
  (renderer does height = cellHeight + yOffset, top = y*cellHeight - yOffset)
- NOTE xOffset only extends LEFTWARD (asymmetric); you cannot get symmetric
  horizontal overhang, so keep weapons inside the cell (see #7).

## 6. Attack sheet layout (4 states x 8 rows)
- Cell 150x150 -> sheet 600x1200. Columns = right/down/left/up (HEADINGS
  = [90,180,270,0]). 8 animation rows.
- In unit.ts set attackSprite xOffset/yOffset = 45 so the 150 cell centers on
  the 60px tile (45px effect margin all round).
- REUSE the idle generator's draw function (import gen_<unit> as G) so the
  vehicle stays pixel-identical; the effect (flame/beam) lives in the margin.
- The body must NOT grow between idle and attack — same SCALE.
- Recoil = shove the body back along -forward via rot() for firing frames.
- Units with power>0 MUST have a real attack sheet; attackSprite:null maps to a
  visible EMPTY_SPRITE blob.

## 7. Horizontal cell-bleed (Scorcher/Strider gun overhang fix)
- In down/up facings a side weapon can reach past the 30px half-cell and appear
  to "float" over neighbors. Keep any weapon reach <= 29px from center.
- Verify by drawing into an oversized canvas and measuring true opaque width.

## 8. Directional relighting (final pass on every sheet)
    from lighting import relight
    relight(img)   # after drawing, before save
- relight(img, opaque=190, rim_strength=0.5, ao_strength=0.34, gradient=0.14)
- Warm rim light (255,246,230) on TOP/RIGHT edges; ambient occlusion darkens
  BOTTOM/LEFT; a soft vertical gradient PER contiguous alpha run (never across
  whole sheet-columns — that bleeds between stacked cells).
- Gated on alpha >= 190 so translucent VFX (flame, beams, smoke) stay untouched.
- No baked drop-shadow: the roster has none, only edge AA. Do not add one.

## 9. Wire-in checklist after art is done
- unit.ts: append the unit (never insert — type is the array index).
- Set sprite/attackSprite paths + xOffset/yOffset (+ tall yOffset:60 if used).
- Run `pnpm check` -> expect 0 errors.
