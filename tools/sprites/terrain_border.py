#!/usr/bin/env python3
"""Shared boundary maths for the NATURAL terrain autotiles (ore beds, wasteland).

A connector-5 tile decides, per pixel, how deep inside the patch it is; the caller
turns that signed depth into bands of ground. This module owns the depth field, and
it exists because the natural terrains all want the same two things — which the
Charred Forest deliberately does NOT:

  Rounded outlines. Folding the per-edge distances with a plain `min` gives a hard
  square corner wherever two open edges meet, and a high-frequency margin wave makes
  the whole boundary ripple. Both read as damage — right for a burn scar, wrong for a
  rock outcrop or a bog, which erode into smooth curves. So the margin carries only
  two low harmonics, and the fold rounds the corner by one of two methods.

  The two methods are NOT interchangeable, and the difference is the main thing to
  understand here. `smooth_min` blends over a band of width `k` and shifts the corner
  in by at most k/4, which is a gentle chamfer. `round_min` is the exact distance to a
  quarter-plane whose tip is a circle of radius `r`, which shifts the corner in by
  0.41r and is a genuine arc. So `round_min` at a given radius rounds roughly four
  times as hard, and only it reads as a curve rather than as a softened angle.

  `round_min` is also the safer of the two, because outside the corner quadrant it IS
  `min`. `smooth_min` perturbs the result whenever the two depths are merely CLOSE,
  which caps how large its `k` can go: on a patch whose four edges are all equally far
  from the centre it starts dragging the middle around.

  Terrains pick their amount deliberately. The burn scar rounds not at all. An ore
  outcrop takes the gentle chamfer, because a hard mineral body reading a little blocky
  is correct. A bog takes a mid-sized arc, and a coastline the largest.

  Soft transitions. A crisp inked line between the patch and the grass reads as a
  cartoon sticker dropped on the map. `dither` jitters the depth per pixel before the
  caller bands it, so every band boundary dissolves into a stipple that interlocks
  with its neighbour — the patch fades into the grass the way real ground does.

Margins stay a function of the coordinate ALONG their edge, at frequencies whose
period divides CELL, so the boundary is identical where two tiles meet and a patch
crosses a seam without a step.
"""
import math

CELL = 60


def hash01(x, y, salt=0):
    n = (x * 374761393 + y * 668265263 + salt * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def mix(a, b, t):
    t = clamp(t, 0.0, 1.0)
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def smooth_min(a, b, k):
    """Polynomial smooth minimum: `min(a, b)` with the crease rounded off over a
    band of width `k`. Folding the four edge distances with this is what turns a
    square patch corner into an arc. Exact when one side is far away, so an edge
    that imposes no limit (a connected neighbour) leaves the other untouched."""
    if k <= 0:
        return min(a, b)
    h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def smooth_max(a, b, k):
    return -smooth_min(-a, -b, k)


def round_min(a, b, r):
    """Intersection of two stretches of ground with the corner between them swept into
    a quarter-circle arc of radius `r`.

    Plain `min(a, b)` is the ground they have in common and leaves a right angle where
    they cross. Here the corner is the exact distance to a quarter-plane whose tip is
    rounded: the boundary follows a circle of radius `r` centred `r` in from both
    edges, which is a real arc, not a chamfer.

    The branches meet exactly (at `a == r` the arc term collapses to `b`), and outside
    the corner quadrant this is `min` — which is what lets `r` be large without the
    side effects `smooth_min` has.
    """
    if a < r and b < r:
        return r - math.hypot(r - a, r - b)
    return a if a < b else b


def round_max(a, b, r):
    return -round_min(-a, -b, r)


def wave(coord, phase, amp):
    """Gentle undulation along an edge. Only the first two harmonics, both with a
    period dividing CELL: enough to keep the outline from reading as a drawn arc,
    smooth enough that it never turns into the burn scar's ripple, and tileable so
    two tiles agree on the boundary they share."""
    return amp * (
        0.70 * math.sin(2 * math.pi * coord / CELL + phase)
        + 0.30 * math.sin(4 * math.pi * coord / CELL + phase * 1.7 + 0.6)
    )


class Border:
    """The depth field for one terrain's patch outline.

    `base` is how far the ground pulls back from an open edge, `amp` how much that
    distance breathes along the edge, and `phases` the four per-edge offsets that stop
    opposite edges mirroring each other.

    Corners take exactly one of two treatments (see the module docstring for why they
    are not the same thing): pass `arc` for a true quarter-circle of that radius, or
    `round_k` for the gentler smooth-minimum chamfer of that blend width.
    """

    def __init__(self, base, amp, phases, round_k=0.0, arc=0.0):
        self.base = base
        self.amp = amp
        self.phases = phases  # (left, top, right, bottom)
        self.round_k = round_k
        self.arc = arc

    def _fold_min(self, a, b):
        return round_min(a, b, self.arc) if self.arc else smooth_min(a, b, self.round_k)

    def _fold_max(self, a, b):
        return round_max(a, b, self.arc) if self.arc else smooth_max(a, b, self.round_k)

    def margin(self, edge, coord):
        index = ("left", "top", "right", "bottom").index(edge)
        return self.base + wave(coord, self.phases[index], self.amp)

    def edge_distance(self, edge, x, y):
        if edge == "left":
            return x - self.margin("left", y)
        if edge == "right":
            return (CELL - 1 - x) - self.margin("right", y)
        if edge == "top":
            return y - self.margin("top", x)
        return (CELL - 1 - y) - self.margin("bottom", x)

    def base_depth(self, x, y, L, U, R, D):
        """Signed px into the patch for a border-base tile. Every open edge pulls the
        boundary in by its margin; a connected edge imposes no limit. Smooth-folded,
        so the corner between two open edges arcs instead of turning a right angle."""
        depth = 999.0
        for edge, connected in (("left", L), ("top", U), ("right", R), ("bottom", D)):
            if not connected:
                depth = self._fold_min(depth, self.edge_distance(edge, x, y))
        return depth

    def corner_depth(self, x, y, edge_a, edge_b):
        """Signed px into the patch for an inner (concave) corner overlay: outside the
        patch only where BOTH bounding edges say so, which is a pocket tucked into the
        corner. Smooth-folded the other way, so the pocket is a rounded bite rather
        than a notch, and built from the same margin curves as the base frames, so its
        boundaries continue the neighbouring tiles' edges exactly."""
        return self._fold_max(
            self.edge_distance(edge_a, x, y),
            self.edge_distance(edge_b, x, y),
        )


def dither(d, x, y, amount, salt=0):
    """Jitter a depth so the band boundary drawn from it breaks into a stipple.

    This is what keeps the patch from having an outline: instead of one clean arc of
    dark pixels, the two materials interleave over a couple of pixels and read as one
    fading into the other.
    """
    return d + (hash01(x, y, salt) - 0.5) * amount


# Sheet column -> (left, up, right, down) neighbour-is-same-family, inverted from
# spriteConnector.borderDecision. Column N must be the tile that decision picks.
INDEX_TO_LURD = {
    0: (True, True, True, True),
    1: (False, True, True, True),
    2: (True, False, True, True),
    3: (True, True, False, True),
    4: (True, True, True, False),
    5: (True, False, False, True),
    6: (False, False, True, True),
    7: (False, False, True, False),
    8: (True, False, False, False),
    9: (False, True, False, False),
    10: (False, False, False, True),
    11: (False, False, False, False),
    12: (True, True, False, False),
    13: (False, True, True, False),
    14: (False, True, False, True),
    15: (True, False, True, False),
}

# The two tile edges whose margins bound each inner-corner frame's pocket
# (paint.cornerQuadrant): 16 top-left, 17 bottom-left, 18 bottom-right, 19 top-right.
CORNER_EDGES = {
    16: ("left", "top"),
    17: ("left", "bottom"),
    18: ("right", "bottom"),
    19: ("right", "top"),
}

STATES = 20  # 16 border-base columns + 4 inner-corner columns


def depth_for_state(border, state):
    """The depth function for one sheet column."""
    if state in INDEX_TO_LURD:
        L, U, R, D = INDEX_TO_LURD[state]
        return lambda x, y: border.base_depth(x, y, L, U, R, D)
    edge_a, edge_b = CORNER_EDGES[state]
    return lambda x, y: border.corner_depth(x, y, edge_a, edge_b)
