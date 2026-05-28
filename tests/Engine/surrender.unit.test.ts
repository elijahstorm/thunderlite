// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { applyAction } from '../../src/lib/Engine/applyAction'
import { isValidSerializedAction } from '../../src/lib/Engine/Interactor/serializedAction'
import { get } from 'svelte/store'

const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const unit = (type: number, team: number): UnitObject => ({
	type,
	state: 0,
	team,
	health: unitData[type].health,
})

const makeMap = (cols: number, rows: number): MapObject => ({
	cols,
	rows,
	layers: {
		ground: new Array(cols * rows).fill(0).map(() => ({ type: PLAINS, state: 0 })),
		sky: new Array(cols * rows).fill(null),
		units: new Array(cols * rows).fill(null),
		buildings: new Array(cols * rows).fill(null),
	},
	filters: { ground: () => [], sky: () => [], units: () => [], buildings: () => [] },
	route: new Array(cols * rows).fill(undefined),
	highlights: new Array(cols * rows).fill(undefined),
})

// A simple two-team board: team 0 at top-left, team 1 at bottom-right.
const twoTeamMap = (): MapObject => {
	const map = makeMap(8, 8)
	map.layers.units[0] = unit(0, 0)
	map.layers.units[8 * 8 - 1] = unit(0, 1)
	return map
}

describe('surrender action', () => {
	beforeEach(() => {
		const map = twoTeamMap()
		initGameStateFromMap(map)
	})

	it('is a valid serialized action only with a team', () => {
		expect(isValidSerializedAction({ kind: 'surrender', team: 0 })).toBe(true)
		expect(isValidSerializedAction({ kind: 'surrender' })).toBe(false)
		expect(isValidSerializedAction({ kind: 'surrender', team: -1 })).toBe(false)
	})

	it('eliminates the surrendering team and ends the match in the opponent’s favour', () => {
		const map = twoTeamMap()
		initGameStateFromMap(map)

		applyAction(map, { kind: 'surrender', team: 0 })

		const state = get(gameState)
		expect(state.players.find((p) => p.team === 0)?.hasLost).toBe(true)
		expect(state.phase).toBe('gameOver')
		expect(state.winner).toBe(1)
	})

	it('does not flip an unrelated team', () => {
		const map = twoTeamMap()
		initGameStateFromMap(map)

		applyAction(map, { kind: 'surrender', team: 0 })

		expect(get(gameState).players.find((p) => p.team === 1)?.hasLost).toBe(false)
	})
})
