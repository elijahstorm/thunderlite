// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { terrainData } from '../../src/lib/GameData/terrain'
import { burnableForestTiles, burnResultTerrainTypes } from '../../src/lib/Engine/modifiers/burn'

const terrainIndex = (name: string) => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`unknown terrain: ${name}`)
	return idx
}

const FOREST = terrainIndex('Forest')
const CHARRED = terrainIndex('Charred Forest')
const PLAINS = terrainIndex('Plains')

const makeMap = (cols: number, rows: number, fill: number): MapObject =>
	({
		cols,
		rows,
		layers: {
			ground: new Array(cols * rows).fill(0).map(() => ({ type: fill, state: 0 })),
			sky: new Array(cols * rows).fill(null),
			units: new Array(cols * rows).fill(null),
			buildings: new Array(cols * rows).fill(null),
		},
		highlights: [],
		route: [],
		filters: {} as never,
	}) as MapObject

describe('burn preload types', () => {
	it('warms Charred Forest when the map contains Forest (so a burned tile is not blank)', () => {
		expect(burnResultTerrainTypes([PLAINS, FOREST])).toContain(CHARRED)
	})

	it('adds nothing when there is no Forest to burn', () => {
		expect(burnResultTerrainTypes([PLAINS, CHARRED])).toEqual([])
	})
})

describe('burnableForestTiles', () => {
	it('returns only the wooded tiles among the struck tile and its neighbours', () => {
		const map = makeMap(5, 5, PLAINS)
		const center = 2 + 2 * 5
		map.layers.ground[center] = { type: FOREST, state: 0 }
		map.layers.ground[center + 1] = { type: FOREST, state: 0 } // east neighbour
		// north neighbour left as plains — must not be reported.
		const tiles = burnableForestTiles(map, center)
		expect(tiles).toContain(center)
		expect(tiles).toContain(center + 1)
		expect(tiles).not.toContain(center - 5)
	})
})
