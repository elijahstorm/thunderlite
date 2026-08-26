#!/usr/bin/env python3
"""Shared pixel-art texture helpers for the generated terrain autotiles.

These exist because the first generated tiles were built like procedural textures —
continuous fields quantized into many near-identical tones with per-pixel hash grain
on top — and next to the hand-authored tiles that reads as airbrush and film noise.
Blown up, the hand tiles are the opposite: a short ramp of well-separated tones, laid
down as irregular clustered patches with hard edges.

Three pieces, all built on one idea: a wrap-around Voronoi, so everything here tiles.

  cell_field  large MASSES. Each cell takes the value of a caller-supplied function
              sampled at the cell's own centre. Feed it a low-frequency function and
              neighbouring cells agree and merge, giving a few big organic areas whose
              boundaries are irregular because the cells are. (Letting each cell pick
              its own value independently is what turns rock into crazy paving.)

  edge_field  the BOUNDARIES between cells, as a ridge width plus the identity of the
              two cells meeting there. Keyed on the pair, a boundary can be opened or
              left closed along its whole length, instead of dissolving into dashes.

  mottle      the TEXTURE inside a mass: two Voronoi scales that nudge a pixel one
              step along its ramp, so patches run from about two pixels to about eight
              the way the Mountain tile's rock face does. One scale alone reads as
              camouflage; no mottling at all reads as vector art.

Variant seeding: the outer `ring` cells of the grid are shared by every variant and
only the interior is reseeded, so a variant differs in its middle while staying
pixel-identical around its border. Callers must keep `ring` wide enough that no
interior cell is ever the nearest (or, for `edge_field`, second-nearest) cell to a
border pixel — otherwise two variants disagree at a seam.

`bayer` is the ordered dither used at the outer boundary into grass. Random per-pixel
jitter softens an edge too, but it reads as grain; an ordered pattern reads as a
deliberate pixel-art edge.
"""
import math

CELL = 60

# 4x4 ordered-dither matrix, as gen_terrain_rampart.py uses for its banded gradients.
_BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
]


def bayer(x, y):
    """Ordered-dither threshold in (0, 1) for this pixel."""
    return (_BAYER[y % 4][x % 4] + 0.5) / 16.0


def hash01(x, y, salt=0):
    n = (x * 374761393 + y * 668265263 + salt * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def ramp_at(ramp, index):
    """Pick from a tone ramp, clamped, so a mottle nudge can never fall off the end."""
    return ramp[int(clamp(index, 0, len(ramp) - 1))]


def _points(grid, ring, variant, salt):
    """Jittered cell centres. Cells in the outer `ring` are shared by every variant."""
    step = CELL / grid
    points = []
    for gy in range(grid):
        for gx in range(grid):
            shared = gx < ring or gy < ring or gx >= grid - ring or gy >= grid - ring
            s = salt if shared else salt + (variant + 1) * 101
            points.append(
                (
                    (gx + 0.10 + 0.80 * hash01(gx, gy, s)) * step,
                    (gy + 0.10 + 0.80 * hash01(gx, gy, s + 2)) * step,
                    gy * grid + gx,
                )
            )
    return points


def _wrapped(x, y, px, py):
    dx = abs(x - px)
    dy = abs(y - py)
    if dx > CELL / 2:
        dx = CELL - dx
    if dy > CELL / 2:
        dy = CELL - dy
    return dx * dx + dy * dy


def cell_field(grid, ring, variant, salt, value_fn):
    """Per-pixel value of the nearest cell, where a cell's value is `value_fn` sampled
    at that cell's centre. Sampling once per CELL rather than per pixel is the whole
    point: it is what makes neighbouring cells share a value and merge into masses."""
    points = [(px, py, value_fn(px, py)) for px, py, _ in _points(grid, ring, variant, salt)]
    field = [[None] * CELL for _ in range(CELL)]
    for y in range(CELL):
        row = field[y]
        for x in range(CELL):
            near, val = 1e9, None
            for px, py, pv in points:
                d = _wrapped(x, y, px, py)
                if d < near:
                    near, val = d, pv
            row[x] = val
    return field


def edge_field(grid, ring, variant, salt):
    """Per-pixel (ridge, id_near, id_second): how close this pixel is to the boundary
    between two cells, and which two. `ridge` is F2 - F1, so it goes to zero exactly
    on the boundary; the ids let a caller decide per BOUNDARY rather than per pixel."""
    points = _points(grid, ring, variant, salt)
    field = [[(9.0, -1, -1)] * CELL for _ in range(CELL)]
    for y in range(CELL):
        row = field[y]
        for x in range(CELL):
            near, second, a, b = 1e9, 1e9, -1, -1
            for px, py, pid in points:
                d = _wrapped(x, y, px, py)
                if d < near:
                    second, b = near, a
                    near, a = d, pid
                elif d < second:
                    second, b = d, pid
            row[x] = (math.sqrt(second) - math.sqrt(near), a, b)
    return field


# --- mottling ------------------------------------------------------------------
# Shared by every variant of every terrain and never reseeded: at this cell size the
# repeat is invisible, and sharing it makes the mottling seamless everywhere for free.
_MOTTLE_COARSE = 9
_MOTTLE_FINE = 21
_mottle_cache = None
_mottle_coarse_cache = None


def _offsets(grid, salt):
    def value(px, py):
        # Recover the cell this centre came from so the offset is stable per cell.
        t = hash01(int(px * 7), int(py * 7), salt + 4)
        return -1 if t < 0.30 else 1 if t > 0.74 else 0

    return cell_field(grid, 0, 0, salt, value)


def mottle(x, y, fine=True):
    """One step up, down, or neither along the caller's ramp.

    Two scales: the coarse one carries patches of roughly seven pixels, the fine one
    fills in only where the coarse is neutral with patches of roughly three. They do
    not stack, so the mass levels keep carrying the big value difference and the
    texture stays a texture.

    `fine=False` drops the small accents and leaves only the broad patches. That is a
    CALMER surface, not a flat one — the distinction matters, because a material that
    wants to read as smoother than its neighbours still cannot go to flat colour
    without falling out of the tileset's look.
    """
    global _mottle_cache, _mottle_coarse_cache
    if _mottle_coarse_cache is None:
        _mottle_coarse_cache = _offsets(_MOTTLE_COARSE, 127)
    if not fine:
        return _mottle_coarse_cache[y][x]
    if _mottle_cache is None:
        fine_field = _offsets(_MOTTLE_FINE, 331)
        _mottle_cache = [
            [
                _mottle_coarse_cache[j][i] or fine_field[j][i]
                for i in range(CELL)
            ]
            for j in range(CELL)
        ]
    return _mottle_cache[y][x]


def massing(harmonics, thresholds, interior_fade=15.0):
    """Build a `value_fn` for `cell_field` that bands a smooth low-frequency swell.

    `harmonics` is a list of (amp, fx, fy, phase) shared by every variant, so cells on
    a tile border agree across variants. A per-variant term is windowed to the tile
    interior, so the massing still differs tile to tile without disturbing the seam.
    """

    def build(variant):
        def value(px, py):
            u = 2 * math.pi * px / CELL
            v = 2 * math.pi * py / CELL
            f = 0.5
            for amp, fx, fy, phase in harmonics:
                f += amp * math.sin(fx * u + phase) * math.cos(fy * v + phase * 0.7)
            edge = min(px, py, CELL - 1 - px, CELL - 1 - py)
            w = clamp(edge / interior_fade, 0.0, 1.0)
            w = w * w * (3 - 2 * w)
            q = variant * 1.61
            f += w * 0.22 * math.sin(u + q) * math.cos(2 * v - q * 1.4)
            level = 0
            for t in thresholds:
                if f > t:
                    level += 1
            return level

        return value

    return build
