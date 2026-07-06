#!/usr/bin/env python3
"""Sea obstacles — Reef, Archipelago, Rock Formation — with their water background
knocked out to transparency so the renderer can composite them over live water.

These three terrains are singular obstacle sprites flagged `ocean` (see terrain.ts):
the surrounding Sea coastline flows *under* them and, being singular, they draw no
shoreline of their own. Baked into each sprite was a full open-water background, so
where one sat against land it painted its own water straight over the shore the Sea
tile beneath had drawn — a visible gap, and inner-corner land was buried too.

The fix is to draw a Sea tile (open water, or a coastline frame + inner corners when
the obstacle touches land) *beneath* the obstacle at render time, and let the obstacle
show only its feature on top. For that the obstacle's own water must be transparent.

Keying is by PALETTE MEMBERSHIP, not a positional diff: the obstacle reuses the Sea's
open-water tones but arranges the waves differently, so a pixel-for-pixel subtract
against the Sea leaves a water halo. Instead we read the Sea's open-water (state 0,
column 0) colour set and knock out any obstacle pixel that matches one of those tones
within TOL. The feature colours (coral teal, rock greys) sit far outside that set, so
the split is clean and stable (identical at TOL 6 and 10 — a real gap, not a threshold
teetering on the edge). A feature pixel that happens to equal a water tone would be
made transparent and simply reveal identical water beneath, so the keying is lossless.

Pristine originals are cached to `<name>_src.png` next to this script the first time it
runs, so re-running rebuilds from the water-backed source rather than an already-keyed
(and so all-transparent-water) sheet.
"""
import os

from PIL import Image

BASE = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/terrain"
HERE = os.path.dirname(os.path.abspath(__file__))

CELL = 60
# Max per-channel distance from a Sea open-water tone for a pixel to count as water.
# The water/feature colour gap is wide (see module docstring), so this is comfortably
# between the two clusters; 6 and 10 give an identical result.
TOL = 8

OBSTACLES = ["reef", "archipelago", "rock-formation"]


def sea_water_palette():
    """Unique RGB tones of the Sea's open-water frame (state 0 = column 0)."""
    sea = Image.open(os.path.join(BASE, "sea.png")).convert("RGBA")
    px = sea.load()
    w, h = sea.size
    tones = set()
    for y in range(h):
        for x in range(CELL):  # column 0 only
            tones.add(px[x, y][:3])
    return list(tones)


def is_water(rgb, palette):
    return any(
        max(abs(rgb[0] - w[0]), abs(rgb[1] - w[1]), abs(rgb[2] - w[2])) <= TOL
        for w in palette
    )


def process(name, palette):
    dst = os.path.join(BASE, f"{name}.png")
    src = os.path.join(HERE, f"{name}_src.png")
    # Cache the pristine water-backed original on first run; rebuild from it after.
    if not os.path.exists(src):
        Image.open(dst).convert("RGBA").save(src)
    im = Image.open(src).convert("RGBA")
    px = im.load()
    w, h = im.size
    knocked = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_water((r, g, b), palette):
                px[x, y] = (r, g, b, 0)
                knocked += 1
    im.save(dst)
    print(f"{name}: {knocked}/{w * h} px -> transparent water ({100 * knocked / (w * h):.1f}%)")


def main():
    palette = sea_water_palette()
    print(f"sea open-water palette: {len(palette)} tones")
    for name in OBSTACLES:
        process(name, palette)


if __name__ == "__main__":
    main()
