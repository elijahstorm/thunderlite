// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { applyAction } from '../../src/lib/Engine/applyAction'

/**
 * Turn rotation with MORE THAN TWO sides on the board.
 *
 * Every deadlock in this area has the same shape: the turn lands on a side that
 * no longer plays (or that nobody commands) and the match sits there, because
 * only the side holding the turn can act and only acting can pass it on. With
 * two sides it never showed — losing a side there simply ends the match — so
 * these paths first became reachable when rooms grew past two seats.
 */
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
// Any always-buildable ground unit; the type only has to exist and hold HP.
const INFANTRY = unitData.findIndex((u) => u.health > 0)

const unit = (team: number): UnitObject => ({
	type: INFANTRY,
	state: 0,
	team,
	health: unitData[INFANTRY].health,
})

const makeMap = (cols: number, rows: number): MapObject =>
	({
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
	}) as unknown as MapObject

/** A board with three sides, each fielding one unit far from the others. */
const threeSideBoard = () => {
	const map = makeMap(9, 9)
	map.layers.units[0] = unit(0)
	map.layers.units[40] = unit(1)
	map.layers.units[80] = unit(2)
	initGameStateFromMap(map)
	return map
}

const teamsInPlay = () => get(gameState).players.map((p) => p.team)
const currentTeam = () => get(gameState).currentTeam
const phase = () => get(gameState).phase

beforeEach(() => {
	// Defeat blasts are timer-driven; nothing here waits on them.
	vi.useFakeTimers()
})

describe('three sides take turns in order', () => {
	it('derives all three sides and starts on the lowest', () => {
		threeSideBoard()
		expect(teamsInPlay()).toEqual([0, 1, 2])
		expect(currentTeam()).toBe(0)
	})

	it('rotates 0 → 1 → 2 → 0 and does not end after one side', () => {
		const map = threeSideBoard()
		applyAction(map, { kind: 'end-turn' })
		expect(currentTeam()).toBe(1)
		applyAction(map, { kind: 'end-turn' })
		expect(currentTeam()).toBe(2)
		applyAction(map, { kind: 'end-turn' })
		expect(currentTeam()).toBe(0)
		expect(phase()).toBe('playing')
	})
})

describe('a side leaving the game never keeps the turn', () => {
	it('hands the turn on when the ACTIVE side forfeits', () => {
		const map = threeSideBoard()
		// Side 0 is up and quits. The match continues 1-v-2, so somebody has to be
		// given the turn — leaving it on side 0 froze the match outright.
		applyAction(map, { kind: 'surrender', team: 0 })

		expect(phase()).toBe('playing')
		expect(currentTeam()).toBe(1)
		expect(get(gameState).players.find((p) => p.team === 0)?.hasLost).toBe(true)
	})

	it('rotates past a forfeited side on the next handover', () => {
		const map = threeSideBoard()
		applyAction(map, { kind: 'surrender', team: 1 })
		// Side 1 quit out of turn; side 0 still holds it and passes straight to 2.
		expect(currentTeam()).toBe(0)
		applyAction(map, { kind: 'end-turn' })
		expect(currentTeam()).toBe(2)
	})

	it('wraps from the last side back past a forfeited one', () => {
		const map = threeSideBoard()
		applyAction(map, { kind: 'end-turn' }) // → 1
		applyAction(map, { kind: 'end-turn' }) // → 2
		applyAction(map, { kind: 'surrender', team: 0 })

		expect(currentTeam()).toBe(2)
		applyAction(map, { kind: 'end-turn' })
		expect(currentTeam()).toBe(1)
	})

	it('still ends the match once only one side is left', () => {
		const map = threeSideBoard()
		applyAction(map, { kind: 'surrender', team: 0 })
		applyAction(map, { kind: 'surrender', team: 1 })

		expect(phase()).toBe('gameOver')
		expect(get(gameState).winner).toBe(2)
	})

	it('skips a side that is eliminated the moment it receives the turn', () => {
		const map = threeSideBoard()
		// Side 1's army is gone but it has not been latched as lost yet — the very
		// evaluation at the end of the handover to side 1 declares it. The turn must
		// not be left sitting on it.
		map.layers.units[40] = null

		applyAction(map, { kind: 'end-turn' })

		expect(get(gameState).players.find((p) => p.team === 1)?.hasLost).toBe(true)
		expect(currentTeam()).toBe(2)
		expect(phase()).toBe('playing')
	})
})
