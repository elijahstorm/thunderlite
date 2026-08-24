// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { boardDigest } from '../../src/lib/Engine/boardDigest'
import {
	isSyncLocked,
	lockGameplayForDesync,
	reportDesync,
	resetDesync,
	syncLocked,
} from '../../src/lib/Engine/desync'
import { initGameStateFromMap, resetGameState, gameState } from '../../src/lib/Engine/gameState'
import { interactor, surrender } from '../../src/lib/Engine/Interactor/interactor'
import { interactionState } from '../../src/lib/Engine/Interactor/interactionState'
import { outgoingActions } from '../../src/lib/Engine/outgoingActions'
import { terrainData } from '../../src/lib/GameData/terrain'
import { unitData } from '../../src/lib/GameData/unit'

/**
 * The sync lock: what a client does once it KNOWS its board no longer matches
 * the room.
 *
 * Before this, the answer was "carry on". Match 13 is what that looks like from
 * both sides. One player's opening moves never reached the log, so their units
 * were somewhere only their own screen agreed on. They kept playing — every
 * later action taken against a board nobody else had — while the opponent, who
 * saw the true log, walked onto tiles that were "occupied" on the first player's
 * screen and made their units appear to blink out of existence.
 *
 * There is no reconciliation to run: the event log is the only truth and a
 * reload is the only way back to it. So the honest behaviour is to stop
 * accepting input the moment a divergence is proven, rather than let the player
 * spend a turn writing history that cannot be recorded.
 */

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
		highlights: new Array(cols * rows),
		route: [],
		pathHistory: [],
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
	interactionState.set('select')
	outgoingActions.set(null)
})

describe('sync lock', () => {
	it('is off for an ordinary match, so nothing off the network path changes', () => {
		expect(isSyncLocked()).toBe(false)
		expect(get(syncLocked)).toBe(false)
	})

	it('swallows board input once locked, leaving the board untouched', () => {
		const map = makeMap(6, 6)
		placeUnit(map, 8, 0)
		initGameStateFromMap(map)
		const before = boardDigest(map)

		lockGameplayForDesync()
		interactor({ map, tile: 8 })

		// Not even a selection: the click never reaches the interaction state machine.
		expect(get(interactionState)).toBe('select')
		expect(boardDigest(map)).toBe(before)
	})

	it('relays nothing while locked — the point is to stop writing history', () => {
		const map = makeMap(6, 6)
		placeUnit(map, 8, 0)
		initGameStateFromMap(map)

		lockGameplayForDesync()
		interactor({ map, tile: 8 })
		interactor({ map, tile: 9 })

		expect(get(outgoingActions)).toBeNull()
	})

	it('still lets the player surrender', () => {
		const map = makeMap(6, 6)
		placeUnit(map, 8, 0)
		initGameStateFromMap(map)

		lockGameplayForDesync()
		surrender(map, 0)

		// Quitting is always available, and the server attributes it to the sender's
		// own team rather than trusting the board it came from.
		expect(get(outgoingActions)).toEqual({ kind: 'surrender', team: 0 })
		expect(get(gameState).players.find((p) => p.team === 0)?.hasLost).toBe(true)
	})

	it('locks on an unrelayed action, not just on an unapplyable one', () => {
		// The half that used to be silent: the room refused something this board has
		// already applied. Same divergence as an engine bail-out, opposite direction.
		reportDesync({ kind: 'move', from: 20, to: 12 }, 'action-refused')
		expect(isSyncLocked()).toBe(false)

		// `reportDesync` alone only diagnoses — the online layer decides to freeze,
		// because a report raised while replaying the shared log is not a divergence.
		lockGameplayForDesync()
		expect(isSyncLocked()).toBe(true)
	})

	it('clears on a fresh match, so a rematch is not born frozen', () => {
		lockGameplayForDesync()
		expect(isSyncLocked()).toBe(true)

		resetDesync()

		expect(isSyncLocked()).toBe(false)
	})
})
