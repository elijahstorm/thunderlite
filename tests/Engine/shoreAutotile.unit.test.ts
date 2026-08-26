// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { terrainData } from '../../src/lib/GameData/terrain'
import {
	cornerDecision,
	connectionDecision,
	variantDecision,
} from '../../src/lib/Sprites/spriteConnector'
import { cornerQuadrant, FIRST_CAP_STATE } from '../../src/lib/Engine/paint'

// Which quadrant a pocket cap belongs to, from its position in POCKETS below: the
// twelve run corner by corner, three to a corner.
const cornerQuadrantOf = (state: number) => Math.floor((state - 28) / 3)

// The Shore's beach is drawn as one continuous coastline across a run of tiles.
// Two things have to hold for that, and both are easy to break silently:
//
//   1. Every tile of a straight run resolves to the SAME border state, so the
//      generated sheet's seam-continuous edges line up. That has always worked —
//      the old art just didn't draw it that way.
//   2. The beach ends only where it actually runs out. `ocean` folds Sea and Shore
//      into one body of water, so the border state alone cannot tell a beach
//      carrying on from a beach spilling into open Sea. The end caps come from a
//      second reading of the neighbours, and pointing them at the wrong border
//      would drop a rock headland into the middle of a beach.

const TYPE = Object.fromEntries(terrainData.map((t, i) => [t.name, i]))
const SHORE = TYPE['Shore']
const SEA = TYPE['Sea']
const PLAINS = TYPE['Plains']

const CAPS = { TL_H: 20, TR_H: 21, BL_H: 22, BR_H: 23, TL_V: 24, BL_V: 25, TR_V: 26, BR_V: 27 }

// Build a map from a picture: '.' plains, 'S' shore, '~' sea.
const scene = (rows: string[]) => {
	const cols = rows[0].length
	const ground = rows
		.join('')
		.split('')
		.map((c) => ({ type: c === 'S' ? SHORE : c === '~' ? SEA : PLAINS, state: 0 }))
	return {
		map: { cols, rows: rows.length, layers: { ground } } as unknown as MapObject,
		at: (col: number, row: number) => row * cols + col,
		ground,
	}
}

const draw = (rows: string[], col: number, row: number) => {
	const { map, at, ground } = scene(rows)
	const location = at(col, row)
	const object = ground[location] as unknown as GroundObject
	return {
		state: connectionDecision(object)(map, location),
		overlays: cornerDecision(object)(map, location),
		variant: variantDecision(object)(map, location),
	}
}

describe('shore coastline autotiling', () => {
	it('gives every tile of a straight beach the same border state', () => {
		const rows = ['........', 'SSSSSSSS', '~~~~~~~~']
		// Columns 1..6 are interior: land above, beach either side, water below.
		const states = [1, 2, 3, 4, 5, 6].map((c) => draw(rows, c, 1).state)
		expect(new Set(states).size, 'one shared frame across the run').toBe(1)
	})

	it('caps a beach only where it runs out into deep water', () => {
		//   ......
		//   ~~SSS~     beach in the middle of open sea
		//   ~~~~~~
		const rows = ['......', '~~SSS~', '~~~~~~']
		const left = draw(rows, 2, 1)
		const middle = draw(rows, 3, 1)
		const right = draw(rows, 4, 1)
		expect(left.overlays, 'west end meets the Sea').toContain(CAPS.TL_H)
		expect(left.overlays, 'east end carries on into beach').not.toContain(CAPS.TR_H)
		expect(middle.overlays, 'mid-run needs no headland at all').toEqual([])
		expect(right.overlays, 'east end meets the Sea').toContain(CAPS.TR_H)
		expect(right.overlays, 'west end carries on into beach').not.toContain(CAPS.TL_H)
	})

	it('does not cap a beach that runs to the edge of the map', () => {
		// Off-map reads as open water for the coastline, so the sand is taken to
		// carry on off the board too — a beach never raises a headland on the map's
		// own rim (see OFF_MAP_WATER in spriteConnector).
		const rows = ['....', 'SSSS', '~~~~']
		const edge = draw(rows, 0, 1)
		expect(edge.overlays).not.toContain(CAPS.TL_H)
	})

	it('caps a vertical beach on the border it actually runs out through', () => {
		//   .~~
		//   .S~     beach hugging land to the west, open sea above and below
		//   .~~
		const rows = ['.~~', '.S~', '.~~']
		const only = draw(rows, 1, 1)
		expect(only.overlays).toContain(CAPS.TL_V)
		expect(only.overlays).toContain(CAPS.BL_V)
		expect(only.overlays).not.toContain(CAPS.TL_H)
	})

	it('never caps a beach against another beach, however the coast turns', () => {
		// An L-shaped beach: every neighbour along it is beach, so no headland
		// belongs anywhere inside it.
		const rows = ['.....', '.SSS.', '.S...', '.S...']
		for (const [c, r] of [
			[1, 1],
			[2, 1],
			[3, 1],
			[1, 2],
			[1, 3],
		]) {
			const tile = draw(rows, c, r)
			const caps = tile.overlays.filter((o) => o >= 20)
			expect(caps, `tile ${c},${r} sits inside the beach`).toEqual([])
		}
	})

	it('leaves the Sea uncapped — only a beach has an end to draw', () => {
		const rows = ['....', '~~~~', '~~~~']
		const sea = draw(rows, 1, 1)
		expect(
			sea.overlays.every((o) => o < 20),
			'sea keeps inner corners only'
		).toBe(true)
	})

	it('spreads variants over neighbouring tiles instead of striping them', () => {
		const rows = Array.from({ length: 6 }, () => 'SSSSSSSS')
		const seen = new Set<number>()
		let matchingNeighbours = 0
		let pairs = 0
		for (let r = 0; r < 6; r++) {
			for (let c = 0; c < 8; c++) {
				const v = draw(rows, c, r).variant
				seen.add(v)
				if (c > 0) {
					pairs++
					if (v === draw(rows, c - 1, r).variant) matchingNeighbours++
				}
			}
		}
		expect(seen.size, 'uses the whole variant set').toBe(terrainData[SHORE].variants)
		// A hash that stripes (say `location % n`) would make every horizontal
		// neighbour differ by exactly one and never repeat; a positional hash lands
		// uncorrelated. Either extreme is the bug, so just check it is not degenerate.
		expect(matchingNeighbours).toBeLessThan(pairs * 0.5)
	})

	it('keeps a tile on the same variant across recomputes', () => {
		const rows = ['....', 'SSSS', '~~~~']
		expect(draw(rows, 2, 1).variant).toBe(draw(rows, 2, 1).variant)
	})

	it('gives single-variant terrain row 0', () => {
		const { map, at, ground } = scene(['~~~', '~~~'])
		const sea = ground[at(1, 1)] as unknown as GroundObject
		expect(terrainData[SEA].variants ?? 1).toBe(1)
		expect(variantDecision(sea)(map, at(1, 1))).toBe(0)
	})
})

// A beach's sand does not only come from the border state's edge bands. An inner
// corner overlay draws a POCKET around a land tile touching the beach diagonally,
// and that pocket's sand runs out through both borders flanking its corner. Those
// borders are invisible to the edge caps above, which only walk LAND-facing edges —
// so a tile with water on all four sides and land on a diagonal was capped nowhere
// and its beach was sliced flat against the open Sea beside it.
const POCKETS = {
	TL_L: 28, TL_T: 29, TL_BOTH: 30,
	BL_L: 31, BL_B: 32, BL_BOTH: 33,
	BR_R: 34, BR_B: 35, BR_BOTH: 36,
	TR_R: 37, TR_T: 38, TR_BOTH: 39,
}

describe('shore inner-corner caps', () => {
	it('ends a corner pocket at each border it spills into open Sea through', () => {
		//   . ~ .      the middle tile has water on all four sides and land on all
		//   S S ~      four diagonals, so its whole beach comes from pockets
		//   . ~ .
		const rows = ['.~.', 'SS~', '.~.']
		const { overlays } = draw(rows, 1, 1)
		expect(overlays).toEqual(expect.arrayContaining([16, 17, 18, 19]))
		// Its left neighbour is beach, so the two pockets on that side keep the border
		// they spill into open Sea through and only that one. The two on the right have
		// Sea both ways, which is one overlay ending both — never two, since the second
		// would paint over the first and leave a border uncapped.
		expect(overlays).toEqual(
			expect.arrayContaining([POCKETS.TL_T, POCKETS.BL_B, POCKETS.TR_BOTH, POCKETS.BR_BOTH])
		)
		expect(overlays).not.toContain(POCKETS.TL_L)
		expect(overlays).not.toContain(POCKETS.TL_BOTH)
		expect(overlays).not.toContain(POCKETS.BL_L)
		expect(overlays).not.toContain(POCKETS.TR_T)
		expect(overlays).not.toContain(POCKETS.TR_R)
	})

	it('leaves a pocket uncapped where the beach carries on into more beach', () => {
		const rows = ['.S.', 'SSS', '.S.']
		const { overlays } = draw(rows, 1, 1)
		expect(overlays).toEqual(expect.arrayContaining([16, 17, 18, 19]))
		for (const cap of Object.values(POCKETS)) expect(overlays).not.toContain(cap)
	})

	it('caps nothing where there is no pocket to cap', () => {
		// Land above the whole row: every tile's sand comes from its top edge, which
		// the edge caps own. No diagonal pockets, so no pocket caps.
		const rows = ['...', 'SS~', '~~~']
		const { overlays } = draw(rows, 0, 1)
		for (const cap of Object.values(POCKETS)) expect(overlays).not.toContain(cap)
	})

	it('ends a pocket boxed in by open Sea with one overlay, not two', () => {
		// The checkerboard: every cardinal is Sea and every diagonal is land, so all
		// four pockets have to end both ways at once. Two overlays per pocket would
		// share a quadrant and the loser's border would come out uncapped.
		const { overlays } = draw(['.~.~.', '~S~S~', '.~.~.'], 1, 1)
		const caps = overlays.filter((o) => o >= 28)
		expect(caps.sort((a, b) => a - b)).toEqual([
			POCKETS.TL_BOTH,
			POCKETS.BL_BOTH,
			POCKETS.BR_BOTH,
			POCKETS.TR_BOTH,
		].sort((a, b) => a - b))
		expect(new Set(caps.map((c) => cornerQuadrantOf(c))).size, 'one per quadrant').toBe(4)
	})
})

// The two overlay mechanisms have to stay separable. An inner corner is a quadrant
// copy, a cap is a whole cell that carries its own transparency, and paint.corners
// tells them apart purely by `corner >= FIRST_CAP_STATE`. If a cap ever slipped
// below that line it would be drawn as a quadrant — which is exactly the bug the
// whole-cell caps fixed, since a cap reaches further than a quadrant.
describe('overlay states stay on the right side of the cap boundary', () => {
	it('keeps the quadrant table to inner corners only', () => {
		for (const state of Object.keys(cornerQuadrant).map(Number))
			expect(state).toBeLessThan(FIRST_CAP_STATE)
	})

	it('emits inner corners below the boundary and every cap above it', () => {
		// Land above (an edge band) and land at the bottom-left diagonal (a pocket),
		// with open Sea on every water side, so both kinds of overlay appear at once.
		const { overlays } = draw(['...', '~S~', '.~~'], 1, 1)
		const inner = overlays.filter((o) => o < FIRST_CAP_STATE)
		const caps = overlays.filter((o) => o >= FIRST_CAP_STATE)
		expect(inner.length, 'at least one inner corner').toBeGreaterThan(0)
		expect(caps.length, 'at least one cap').toBeGreaterThan(0)
		for (const state of inner) expect(cornerQuadrant[state]).toBeDefined()
		for (const state of caps) expect(cornerQuadrant[state]).toBeUndefined()
	})
})
