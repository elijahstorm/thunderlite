// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
	connectionDecision,
	cornerDecision,
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
