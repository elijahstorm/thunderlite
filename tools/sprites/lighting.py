"""Shared directional-lighting post-pass for the unit sprite generators.

The generators draw each surface as a flat fill, which reads as static/lifeless.
relight() simulates a single light from the top-right by walking the finished
silhouette: pixels on a top/right-facing edge get a warm rim highlight, pixels on
a bottom/left-facing edge get ambient-occlusion shadow, and the solid interior
gets a faint top-to-bottom gradient so large faces aren't dead flat. Translucent
VFX (smoke, energy fields, flame, spray) are left alone via the `opaque` gate.

Silhouette-based, so it needs no cell-size info — transparent gaps between cells
keep the effect local to each unit. Call once on the full sheet before saving.
"""
from PIL import Image

RIM = (255, 246, 230)  # warm key light


def relight(img, opaque=190, rim_strength=0.5, ao_strength=0.34, gradient=0.14):
	px = img.load()
	W, H = img.size

	def solid(x, y):
		if x < 0 or y < 0 or x >= W or y >= H:
			return False
		return px[x, y][3] >= opaque

	rim_px, ao_px = [], []
	for y in range(H):
		for x in range(W):
			if not solid(x, y):
				continue
			up, upr, rt = (not solid(x, y - 1)), (not solid(x + 1, y - 1)), (not solid(x + 1, y))
			dn, lf = (not solid(x, y + 1)), (not solid(x - 1, y))
			if up or upr or rt:
				rim_px.append((x, y))
			elif dn or lf:
				ao_px.append((x, y))

	def lerp(c, t, s):
		return (
			int(c[0] + (t[0] - c[0]) * s),
			int(c[1] + (t[1] - c[1]) * s),
			int(c[2] + (t[2] - c[2]) * s),
		)

	# interior vertical gradient, anchored to each contiguous solid RUN in a column
	# (a run == one unit in one cell, since transparent gaps separate the cells —
	# so the gradient never bleeds across the stacked frames of the sheet).
	if gradient > 0:
		for x in range(W):
			y = 0
			while y < H:
				if not solid(x, y):
					y += 1
					continue
				y0 = y
				while y < H and solid(x, y):
					y += 1
				y1 = y - 1
				run = y1 - y0
				if run <= 0:
					continue
				for yy in range(y0, y1 + 1):
					r, g, b, a = px[x, yy]
					# +gradient at the run's top fading to -gradient at its bottom
					f = (1 - (yy - y0) / run) * 2 - 1
					s = gradient * f
					target = (255, 255, 255) if s >= 0 else (0, 0, 0)
					nr = lerp((r, g, b), target, abs(s))
					px[x, yy] = (nr[0], nr[1], nr[2], a)

	for x, y in ao_px:
		r, g, b, a = px[x, y]
		nr = lerp((r, g, b), (0, 0, 0), ao_strength)
		px[x, y] = (nr[0], nr[1], nr[2], a)
	for x, y in rim_px:
		r, g, b, a = px[x, y]
		nr = lerp((r, g, b), RIM, rim_strength)
		px[x, y] = (nr[0], nr[1], nr[2], a)

	return img
