// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { applyAction } from '../../src/lib/Engine/applyAction'
import { boardDigest, boardSnapshot } from '../../src/lib/Engine/boardDigest'
import { desyncCount, desyncReports, resetDesync } from '../../src/lib/Engine/desync'
import { initGameStateFromMap, resetGameState } from '../../src/lib/Engine/gameState'
import { terrainData } from '../../src/lib/GameData/terrain'
import { unitData } from '../../src/lib/GameData/unit'

const terrainIndex = (name: string): number => terrainData.findIndex((t) => t.name === name)
const unitIndex = (name: string): number => unitData.findIndex((u) => u.name === name)

const PLAINS = terrainIndex('Plains')
const SCORPION_TANK = unitIndex('Scorpion Tank')

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
		highlights: [],
		route: [],
		filters: {} as never,
	}) as MapObject

const placeUnit = (map: MapObject, tile: number, team: number) => {
	map.layers.units[tile] = {
		type: SCORPION_TANK,
		state: 0,
		team,
		health: unitData[SCORPION_TANK].health,
	}
}

beforeEach(() => {
	resetGameState()
	resetDesync()
})

/**
 * The live-match bug this guards: a relayed attack applied on a client whose
 * board doesn't have the attacker where the sender says it is. `applyAttack`
 * cannot apply it (there is nothing to attack from), so the exchange is skipped
 * — and used to be skipped in total silence, leaving the two players' boards
 * permanently disagreeing about a unit's health with nothing to notice it.
 */
describe('desync detection', () => {
	it('reports an attack whose attacker tile is empty instead of dropping it silently', () => {
		const map = makeMap(6, 6)
		placeUnit(map, 8, 1)
		initGameStateFromMap(map)

		const before = boardDigest(map)
		// tile 7 is empty — exactly the state a mid-animation move leaves behind.
		applyAction(map, { kind: 'attack', from: 7, to: 8 })

		expect(get(desyncCount)).toBe(1)
		expect(get(desyncReports)?.reason).toBe('missing-attacker')
		// Still a no-op on the board — the report is a signal, not a behaviour change.
		expect(boardDigest(map)).toBe(before)
	})

	it('reports an attack whose target tile is empty', () => {
		const map = makeMap(6, 6)
		placeUnit(map, 7, 0)
		initGameStateFromMap(map)

		applyAction(map, { kind: 'attack', from: 7, to: 8 })

		expect(get(desyncReports)?.reason).toBe('missing-target')
	})

	it('reports a move whose mover is not on the source tile', () => {
		const map = makeMap(6, 6)
		initGameStateFromMap(map)

		applyAction(map, { kind: 'move', from: 3, to: 4 })

		expect(get(desyncReports)?.reason).toBe('missing-mover')
	})

	it('stays quiet for actions that apply cleanly', () => {
		const map = makeMap(6, 6)
		placeUnit(map, 7, 0)
		placeUnit(map, 8, 1)
		initGameStateFromMap(map)

		applyAction(map, { kind: 'attack', from: 7, to: 8 })

		expect(get(desyncCount)).toBe(0)
	})
})

describe('boardDigest', () => {
	it('matches between two boards built the same way, and diverges after a dropped attack', () => {
		const a = makeMap(6, 6)
		placeUnit(a, 7, 0)
		placeUnit(a, 8, 1)
		initGameStateFromMap(a)
		const b = makeMap(6, 6)
		placeUnit(b, 7, 0)
		placeUnit(b, 8, 1)

		// Same actions, same order → same fingerprint.
		expect(boardDigest(a)).toBe(boardDigest(b))

		// Client A lands the attack; client B drops it (its attacker tile was empty
		// mid-animation). This is the exact moment the two games split.
		applyAction(a, { kind: 'attack', from: 7, to: 8 })
		expect(boardDigest(a)).not.toBe(boardDigest(b))
		expect(boardSnapshot(a)).not.toBe(boardSnapshot(b))
	})

	it('ignores transient render-only fields so animation never fakes a divergence', () => {
		const map = makeMap(4, 4)
		placeUnit(map, 5, 0)
		initGameStateFromMap(map)

		const clean = boardDigest(map)
		const unit = map.layers.units[5]!
		unit.animating = true
		unit.displayHealth = 3

		expect(boardDigest(map)).toBe(clean)
	})
})
