// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	connectionDecision,
	cornerDecision,
	seaUnderlayDecision,
	variantDecision,
} from '../../src/lib/Sprites/spriteConnector'
import { terrainData } from '../../src/lib/GameData/terrain'

// The connector-5 border used to match a neighbour on terrain TYPE. It now matches
// on FAMILY — a terrain's own type unless it declares one — which is what lets the
// three Ore Deposits autotile as a single mineral bed while a Charred Forest scar
// still borders only against itself. Both halves of that are worth pinning: the
// generalisation is invisible in the art until a map puts two richnesses together,
// and a regression would quietly go back to every deposit cutting its own rim.

const typeOf = (name: string) => {
	const index = terrainData.findIndex((t) => t.name === name)
	expect(index, `no terrain named ${name}`).toBeGreaterThanOrEqual(0)
	return index
}

const PLAINS = typeOf('Plains')
const ENRICHED = typeOf('Enriched Ore Deposit')
const ORE = typeOf('Ore Deposit')
const DEPLETED = typeOf('Depleted Ore Deposit')
const WASTELAND = typeOf('Wasteland')
const CHARRED = typeOf('Charred Forest')
const SEA = typeOf('Sea')
const SHORE = typeOf('Shore')
const REEF = typeOf('Reef')

/** A board from a grid of terrain type indices, one row per array. */
const board = (rows: number[][]): MapObject =>
	({
		rows: rows.length,
		cols: rows[0].length,
		layers: {
			ground: rows.flat().map((type) => ({ type, state: 0 })),
			sky: rows.flat().map(() => null),
			units: rows.flat().map(() => null),
			buildings: rows.flat().map(() => null),
		},
	}) as unknown as MapObject

const stateAt = (map: MapObject, index: number) => {
	const object = map.layers.ground[index]
	return connectionDecision(object)(map, index)
}
const cornersAt = (map: MapObject, index: number) => {
	const object = map.layers.ground[index]
	return cornerDecision(object)(map, index)
}

// Border frames, from spriteConnector.borderDecision — the sheet column each
// (left, up, right, down) combination of connected neighbours resolves to.
const ISOLATED = 11 // no neighbour connects
const RIGHT_ONLY = 7 // only the right neighbour connects
const LEFT_ONLY = 8 // only the left neighbour connects
const ENCLOSED = 0 // all four connect

describe('connector-5 family border', () => {
	it('reads a different ore richness as connected, so one bed shares a rim', () => {
		const map = board([
			[PLAINS, PLAINS, PLAINS],
			[PLAINS, ORE, DEPLETED],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(stateAt(map, 4)).toBe(RIGHT_ONLY)
		expect(stateAt(map, 5)).toBe(LEFT_ONLY)
	})

	it('joins all three richnesses into one patch', () => {
		const map = board([
			[PLAINS, ENRICHED, PLAINS],
			[ORE, DEPLETED, ENRICHED],
			[PLAINS, ORE, PLAINS],
		])
		expect(stateAt(map, 4)).toBe(ENCLOSED)
	})

	it('leaves a lone deposit as an isolated tile', () => {
		const map = board([
			[PLAINS, PLAINS, PLAINS],
			[PLAINS, ENRICHED, PLAINS],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(stateAt(map, 4)).toBe(ISOLATED)
	})

	it('keeps families apart: wasteland does not join an ore bed', () => {
		const map = board([
			[PLAINS, PLAINS, PLAINS],
			[PLAINS, WASTELAND, ORE],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(stateAt(map, 4)).toBe(ISOLATED)
		expect(stateAt(map, 5)).toBe(ISOLATED)
	})

	it('still borders a family-less terrain against its own type alone', () => {
		const map = board([
			[PLAINS, PLAINS, PLAINS],
			[PLAINS, CHARRED, CHARRED],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(stateAt(map, 4)).toBe(RIGHT_ONLY)

		const mixed = board([
			[PLAINS, PLAINS, PLAINS],
			[PLAINS, CHARRED, WASTELAND],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(stateAt(mixed, 4)).toBe(ISOLATED)
	})

	it('carves an inner corner where a diagonal neighbour leaves the family', () => {
		// Both cardinals flanking the top-left corner of tile 4 are ore, but the
		// diagonal above-left is plains, so that corner needs its overlay (16 = TL).
		const map = board([
			[PLAINS, ORE, PLAINS],
			[DEPLETED, ENRICHED, PLAINS],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(cornersAt(map, 4)).toEqual([16])
	})

	it('needs no corner where the diagonal is also in the family', () => {
		const map = board([
			[ORE, ORE, PLAINS],
			[DEPLETED, ENRICHED, PLAINS],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(cornersAt(map, 4)).toEqual([])
	})
})

describe('variant blocks', () => {
	const map = board([
		[ORE, ORE, ORE, ORE],
		[ORE, ORE, ORE, ORE],
		[ORE, ORE, ORE, ORE],
	])

	it('stays inside the rows the sheet actually holds', () => {
		const variants = terrainData[ORE].variants ?? 1
		for (let index = 0; index < map.layers.ground.length; index += 1) {
			const variant = variantDecision(map.layers.ground[index])(map, index)
			expect(variant).toBeGreaterThanOrEqual(0)
			expect(variant).toBeLessThan(variants)
		}
	})

	it('is a pure function of position, so a tile keeps its art across reloads', () => {
		const again = board([
			[ORE, ORE, ORE, ORE],
			[ORE, ORE, ORE, ORE],
			[ORE, ORE, ORE, ORE],
		])
		for (let index = 0; index < map.layers.ground.length; index += 1) {
			expect(variantDecision(again.layers.ground[index])(again, index)).toBe(
				variantDecision(map.layers.ground[index])(map, index)
			)
		}
	})

	it('does not hand every tile the same block', () => {
		const seen = new Set(
			map.layers.ground.map((object, index) => variantDecision(object)(map, index))
		)
		expect(seen.size).toBeGreaterThan(1)
	})

	it('gives the whole ore family the same number of blocks to choose from', () => {
		// The three sheets are drawn from one bed, row for row: a tile that switches
		// richness must land on the matching row or the rock under it would jump.
		const counts = [ENRICHED, ORE, DEPLETED].map((t) => terrainData[t].variants ?? 1)
		expect(new Set(counts).size).toBe(1)
	})
})

// The board is a window onto a coastline, not an island in a void: water running
// off the edge of the map is open ocean carrying on past it. So a sea tile on the
// border must autotile as if the missing neighbours were water — otherwise it cuts
// a bank there and the map ends in a rim of grass along its own edge. Only the sea
// gets this; a road or an ore bed genuinely stops at the border.
describe('sea at the edge of the map', () => {
	it('draws open water on a board that is all sea, border included', () => {
		const map = board([
			[SEA, SEA, SEA],
			[SEA, SEA, SEA],
			[SEA, SEA, SEA],
		])
		for (let index = 0; index < map.layers.ground.length; index += 1) {
			expect(stateAt(map, index), `tile ${index} is open water`).toBe(ENCLOSED)
			expect(cornersAt(map, index), `tile ${index} needs no bank`).toEqual([])
		}
	})

	it('gives a border tile the same frame as the same water one tile in', () => {
		// A coast running along the top: every tile of row 1 has land above and water
		// on both sides. The left-hand one is missing its west neighbour to the map
		// edge, and should still resolve exactly like its inland twin.
		const map = board([
			[PLAINS, PLAINS, PLAINS, PLAINS],
			[SEA, SEA, SEA, SEA],
			[SEA, SEA, SEA, SEA],
		])
		expect(stateAt(map, 4)).toBe(stateAt(map, 5))
		expect(cornersAt(map, 4)).toEqual(cornersAt(map, 5))
	})

	it('carves no inner corner from a diagonal that is simply off the board', () => {
		const map = board([
			[SEA, SEA, SEA],
			[SEA, SEA, SEA],
		])
		expect(cornersAt(map, 0), 'top-left corner tile').toEqual([])
	})

	it('still banks against real land next to the border', () => {
		const map = board([
			[PLAINS, SEA, SEA],
			[SEA, SEA, SEA],
		])
		// Tile 1 keeps its west bank against the plains; tile 3 keeps its north one.
		expect(stateAt(map, 1)).not.toBe(ENCLOSED)
		expect(stateAt(map, 3)).not.toBe(ENCLOSED)
		// Tile 4's cardinals are all water but the plains pokes in diagonally.
		expect(cornersAt(map, 4)).toEqual([16])
	})

	it('runs a beach off the edge instead of banking it there', () => {
		const map = board([
			[PLAINS, PLAINS, PLAINS, PLAINS],
			[SHORE, SHORE, SHORE, SHORE],
			[SEA, SEA, SEA, SEA],
		])
		expect(stateAt(map, 4), 'beach at the border matches its inland twin').toBe(stateAt(map, 5))
		// And no headland: the sand carries on off the map rather than ending on it.
		expect(cornersAt(map, 4).filter((c) => c >= 20)).toEqual([])
	})

	it('carries the same reading into the underlay beneath a reef', () => {
		// Reef sprites are cut out over transparent water, so the Sea frame drawn
		// under them has to agree with the tiles around it — including at the border.
		const map = board([
			[REEF, SEA, SEA],
			[SEA, SEA, SEA],
		])
		const underlay = seaUnderlayDecision(map.layers.ground[0])(map, 0)
		expect(underlay).toEqual({ state: ENCLOSED, corners: [] })
	})

	it('leaves land terrain ending at the border, as it always did', () => {
		const scar = board([
			[CHARRED, CHARRED],
			[CHARRED, CHARRED],
		])
		// Every tile of a 2x2 scar is a corner of the patch: none may read as
		// enclosed, or the burn would have no rim where the map cuts it off.
		for (let index = 0; index < scar.layers.ground.length; index += 1) {
			expect(stateAt(scar, index), `scar tile ${index} keeps its rim`).not.toBe(ENCLOSED)
		}
	})
})

// Roads (and canyons — both are connector 1) may leave the board, but only at their
// ends. A route that dead-ends on the border reads as carrying on past it; a route
// running ALONG the border must not sprout a stub through it, or the whole rim of
// the map grows teeth. See `continuesOffMap` in spriteConnector.
const ROAD = typeOf('Road')
const CANYON = typeOf('Canyon')

// Frames from spriteConnector.rollDecision, keyed (left, up, right, down).
const ROLL = {
	NONE: 0,
	WEST_CAP: 1, // connects left only
	NORTH_CAP: 13, // connects up only
	HORIZONTAL: 2,
	VERTICAL: 12,
	CORNER_SE: 10, // right + down
	TEE_WEST: 4, // left + up + down: a T with its stem pointing west
}

describe('routes running off the edge of the map', () => {
	it('carries a road straight through the border it dead-ends on', () => {
		const map = board([
			[PLAINS, PLAINS, PLAINS],
			[ROAD, ROAD, ROAD],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(stateAt(map, 3), 'west end continues off the map').toBe(ROLL.HORIZONTAL)
		expect(stateAt(map, 4), 'middle of the run').toBe(ROLL.HORIZONTAL)
		expect(stateAt(map, 5), 'east end continues off the map').toBe(ROLL.HORIZONTAL)
	})

	it('still caps a road that ends inside the map', () => {
		const map = board([
			[PLAINS, PLAINS, PLAINS],
			[ROAD, ROAD, PLAINS],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(stateAt(map, 4), 'a real dead end keeps its cap').toBe(ROLL.WEST_CAP)
		expect(stateAt(map, 3), 'and its far end still leaves the map').toBe(ROLL.HORIZONTAL)
	})

	it('does not grow a stub off a road running along the border', () => {
		// The coast-road case: a highway hugging the map's east edge. It leaves
		// through the top and bottom, where it is actually headed, and nowhere else.
		const map = board([
			[PLAINS, PLAINS, ROAD],
			[PLAINS, PLAINS, ROAD],
			[PLAINS, PLAINS, ROAD],
		])
		for (const index of [2, 5, 8]) {
			expect(stateAt(map, index), `tile ${index} runs north-south only`).toBe(ROLL.VERTICAL)
		}
	})

	it('leaves a corner turning, not junctioning, in the corner of the map', () => {
		// Entering tile 0 from the east and leaving south: both missing sides are off
		// the board, and neither may talk itself into a connection.
		const map = board([
			[ROAD, ROAD, PLAINS],
			[ROAD, PLAINS, PLAINS],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(stateAt(map, 0)).toBe(ROLL.CORNER_SE)
	})

	it('leaves a junction on the border alone', () => {
		const map = board([
			[PLAINS, PLAINS, ROAD],
			[PLAINS, ROAD, ROAD],
			[PLAINS, PLAINS, ROAD],
		])
		expect(stateAt(map, 5), 'already busy in three directions').toBe(ROLL.TEE_WEST)
	})

	it('leaves a lone tile on the border isolated — there is no route to continue', () => {
		const map = board([
			[ROAD, PLAINS],
			[PLAINS, PLAINS],
		])
		expect(stateAt(map, 0)).toBe(ROLL.NONE)
	})

	it('treats a canyon the same way, since it runs as a route too', () => {
		const map = board([
			[PLAINS, PLAINS, PLAINS],
			[CANYON, CANYON, PLAINS],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(stateAt(map, 3), 'the end on the border runs off it').toBe(ROLL.HORIZONTAL)
		expect(stateAt(map, 4), 'the end inland keeps its cap').toBe(ROLL.WEST_CAP)
	})

	it('keeps the pre-existing caps where the border is not involved', () => {
		// A north-south road stopping in open ground: nothing here touches an edge,
		// so every frame is what it was before routes could leave the map.
		const map = board([
			[PLAINS, ROAD, PLAINS],
			[PLAINS, ROAD, PLAINS],
			[PLAINS, PLAINS, PLAINS],
		])
		expect(stateAt(map, 4)).toBe(ROLL.NORTH_CAP)
		expect(stateAt(map, 1)).toBe(ROLL.VERTICAL) // top edge: its end leaves the map
	})
})
