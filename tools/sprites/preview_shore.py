#!/usr/bin/env python3
"""Render shore test scenes exactly the way the engine composites them, so the
tileset can be judged without booting the game.

Mirrors spriteConnector (borderDecision -> base state, borderCornersWith -> inner
corners, capDecision -> beach end caps, variantDecision -> sheet row) and
paint.groundLayer (base tile, then each overlay's quadrant copied on top).
"""
import os
import sys

from PIL import Image

BASE = "/Users/elijah/dev/elijahstorm/thunderlite/static/game/play/terrain"
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "/tmp"
CELL = 60
FRAMES = 3
VARIANTS = 8

GRASS, SHORE, SEA = "G", "S", "~"
WATER = {SHORE, SEA}

BORDER = {
    (True, True, True, True): 0,
    (False, True, True, True): 1,
    (True, False, True, True): 2,
    (True, True, False, True): 3,
    (True, True, True, False): 4,
    (True, False, False, True): 5,
    (False, False, True, True): 6,
    (False, False, True, False): 7,
    (True, False, False, False): 8,
    (False, True, False, False): 9,
    (False, False, False, True): 10,
    (False, False, False, False): 11,
    (True, True, False, False): 12,
    (False, True, True, False): 13,
    (False, True, False, True): 14,
    (True, False, True, False): 15,
}
# (land edge, exit border) -> [column, quadrant]
CAP_STATE = {
    ("top", "left"): (20, (0, 0)),
    ("top", "right"): (21, (1, 0)),
    ("bottom", "left"): (22, (0, 1)),
    ("bottom", "right"): (23, (1, 1)),
    ("left", "top"): (24, (0, 0)),
    ("left", "bottom"): (25, (0, 1)),
    ("right", "top"): (26, (1, 0)),
    ("right", "bottom"): (27, (1, 1)),
}
CORNER_QUAD = {16: (0, 0), 17: (0, 1), 18: (1, 1), 19: (1, 0)}


def hash_variant(col, row):
    h = ((col * 0x1F1F1F1F) ^ (row * 0x27D4EB2D)) & 0xFFFFFFFF
    h = ((h ^ (h >> 15)) * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    return h % VARIANTS


class Scene:
    def __init__(self, rows):
        self.g = rows
        self.rows = len(rows)
        self.cols = len(rows[0])

    def at(self, c, r):
        if 0 <= c < self.cols and 0 <= r < self.rows:
            return self.g[r][c]
        return None  # off-map reads as land, matching left()/right()/up()/down()

    def water(self, c, r):
        return self.at(c, r) in WATER

    def shore(self, c, r):
        return self.at(c, r) == SHORE


def tile_draw(scene, c, r):
    L, U, R, D = (
        scene.water(c - 1, r),
        scene.water(c, r - 1),
        scene.water(c + 1, r),
        scene.water(c, r + 1),
    )
    state = BORDER[(L, U, R, D)]
    overlays = []
    diag = {
        (-1, -1): scene.water(c - 1, r - 1),
        (-1, 1): scene.water(c + 1, r - 1),
        (1, -1): scene.water(c - 1, r + 1),
        (1, 1): scene.water(c + 1, r + 1),
    }
    if U and L and not diag[(-1, -1)]:
        overlays.append((16, CORNER_QUAD[16]))
    if D and L and not diag[(1, -1)]:
        overlays.append((17, CORNER_QUAD[17]))
    if D and R and not diag[(1, 1)]:
        overlays.append((18, CORNER_QUAD[18]))
    if U and R and not diag[(-1, 1)]:
        overlays.append((19, CORNER_QUAD[19]))

    # Beach caps: only a Shore tile grows a beach, and only where the beach would
    # otherwise run on into water that is NOT beach.
    if scene.at(c, r) == SHORE:
        land = {"left": not L, "top": not U, "right": not R, "bottom": not D}
        cont = {
            "left": scene.shore(c - 1, r),
            "right": scene.shore(c + 1, r),
            "top": scene.shore(c, r - 1),
            "bottom": scene.shore(c, r + 1),
        }
        for land_edge, perps in (
            ("top", ("left", "right")),
            ("bottom", ("left", "right")),
            ("left", ("top", "bottom")),
            ("right", ("top", "bottom")),
        ):
            if not land[land_edge]:
                continue
            for p in perps:
                if land[p] or cont[p]:
                    continue
                overlays.append(CAP_STATE[(land_edge, p)])
    return state, overlays


def render(scene, frame, sheet_shore, sheet_sea, grass):
    img = Image.new("RGBA", (scene.cols * CELL, scene.rows * CELL))
    half = CELL // 2
    for r in range(scene.rows):
        for c in range(scene.cols):
            kind = scene.at(c, r)
            dst = (c * CELL, r * CELL)
            if kind == GRASS:
                img.paste(grass, dst)
                continue
            state, overlays = tile_draw(scene, c, r)
            if kind == SEA:
                img.paste(
                    sheet_sea.crop(
                        (state * CELL, frame * CELL, (state + 1) * CELL, (frame + 1) * CELL)
                    ),
                    dst,
                )
                for idx, (qx, qy) in overlays:
                    if idx > 19:
                        continue
                    sy = frame * CELL + qy * half
                    sx = idx * CELL + qx * half
                    img.paste(
                        sheet_sea.crop((sx, sy, sx + half, sy + half)),
                        (dst[0] + qx * half, dst[1] + qy * half),
                    )
                continue
            v = hash_variant(c, r)
            row = v * FRAMES + frame
            img.paste(
                sheet_shore.crop(
                    (state * CELL, row * CELL, (state + 1) * CELL, (row + 1) * CELL)
                ),
                dst,
            )
            for idx, (qx, qy) in overlays:
                sy = row * CELL + qy * half
                sx = idx * CELL + qx * half
                img.paste(
                    sheet_shore.crop((sx, sy, sx + half, sy + half)),
                    (dst[0] + qx * half, dst[1] + qy * half),
                )
    return img


SCENES = {
    # The shapes from the bug report: a single tile, a strip, a block, a ring.
    "editor": [
        "GGGGGGGGGGGGGGGGGG",
        "GGGGGGGGSGGGGSSSSG",
        "GGSGGGGGGGGGGSGGSG",
        "GGSGGGGGGGGGGSGGSG",
        "GGSGGGSSSGGGGSGGSG",
        "GGGGGGSSSGGGGSSSSG",
        "GGGGGGSSSGGGGGGGGG",
        "GGGGGGGGGGGGGGGGGG",
    ],
    # Campaign 04 row 6: six Sea then eight Shore, all under a straight land edge.
    "trench": [
        "GGGGGGGGGGGGGG",
        "GGGGGGGGGGGGGG",
        "~~~~~~SSSSSSSS",
        "~~~~~~~~~~~~~~",
        "~~~~~~~~~~~~~~",
    ],
    # A ragged coast: the case the old sheet could not draw at all.
    "bay": [
        "GGGGGGGGGGGGGG",
        "GGGGGGGGGGGGGG",
        "GGGSSGGGGGGGGG",
        "GSSSSSSGGGGSSG",
        "SSSSSSSSSSSSSS",
        "SS~~~~~~~~~~SS",
        "~~~~~~~~~~~~~~",
    ],
}


def main():
    shore = Image.open(f"{BASE}/shore.png").convert("RGBA")
    sea = Image.open(f"{BASE}/sea.png").convert("RGBA")
    grass = Image.open(f"{BASE}/plains.png").convert("RGBA").crop((0, 0, CELL, CELL))
    for name, rows in SCENES.items():
        scene = Scene(rows)
        img = render(scene, 0, shore, sea, grass)
        img = img.resize((img.width * 2, img.height * 2), Image.NEAREST)
        path = os.path.join(OUT_DIR, f"shore_{name}.png")
        img.save(path)
        print("wrote", path, img.size)


if __name__ == "__main__":
    main()
