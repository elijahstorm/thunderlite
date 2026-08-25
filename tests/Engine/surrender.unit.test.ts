// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { applyAction } from '../../src/lib/Engine/applyAction'
import { surrender, teamStillPlaying } from '../../src/lib/Engine/Interactor/interactor'
import { outgoingActions } from '../../src/lib/Engine/outgoingActions'
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

// A four-side board: the match carries on after one side quits, so the quitter's
// client sits on a live board with its resign paths still wired.
const fourTeamMap = (): MapObject => {
	const map = makeMap(8, 8)
	map.layers.units[0] = unit(0, 0)
	map.layers.units[7] = unit(0, 1)
	map.layers.units[8 * 8 - 8] = unit(0, 2)
	map.layers.units[8 * 8 - 1] = unit(0, 3)
	return map
}

describe('resigning twice', () => {
	it('relays one surrender per side, however many times it is asked for', () => {
		const map = fourTeamMap()
		initGameStateFromMap(map)

		const relayed: unknown[] = []
		const stop = outgoingActions.subscribe((action) => action && relayed.push(action))

		surrender(map, 2)
		// Still 'playing' — two other sides are alive — so the old `phase` gate let
		// the give-up and exit-to-menu paths file a second forfeit for a side that
		// was already out. Match 19 recorded exactly that, 640 events later.
		expect(get(gameState).phase).toBe('playing')
		surrender(map, 2)
		surrender(map, 2)

		stop()
		expect(relayed).toEqual([{ kind: 'surrender', team: 2 }])
		expect(get(gameState).players.find((p) => p.team === 2)?.hasLost).toBe(true)
	})

	it('reports a side as out of play once it has lost, and once the match is over', () => {
		const map = fourTeamMap()
		initGameStateFromMap(map)

		expect(teamStillPlaying(2)).toBe(true)
		surrender(map, 2)
		expect(teamStillPlaying(2)).toBe(false)
		expect(teamStillPlaying(1)).toBe(true)
		// A team the board never fielded is not "still playing" either.
		expect(teamStillPlaying(9)).toBe(false)
	})
})
