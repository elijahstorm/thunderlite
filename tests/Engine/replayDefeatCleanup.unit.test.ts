// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { get } from 'svelte/store'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'
import { buildingData } from '../../src/lib/GameData/building'
import { gameState, initGameStateFromMap, NEUTRAL_TEAM } from '../../src/lib/Engine/gameState'
import { resolveTeamDefeat } from '../../src/lib/Engine/defeat'
import {
	dispatchSerializedAction,
	type SerializedAction,
} from '../../src/lib/Engine/Interactor/serializedAction'

/**
 * ReplayViewer has no GameStateManager, so it resolves defeats itself. This
 * covers that loop: a surrender in the log only flips `hasLost`, and unless the
 * viewer clears the board too, the dead team's army stands there for the rest of
 * the playback and its buildings never revert to neutral (so later captures
 * replay under a dead owner). Regression for match 19's replay.
 */

const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const REFINERY = buildingData.findIndex((b) => b.name === 'Oil Refinery')

const unit = (type: number, team: number): UnitObject => ({
	type,
	state: 0,
	team,
	health: unitData[type].health,
})
const building = (type: number, team: number): BuildingObject =>
	({ type, state: 0, team }) as BuildingObject

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

// Four seats, as in the match that surfaced this: two resign early and the other
// two fight on, so the log keeps running well past the first defeat.
const fourTeamMap = (): MapObject => {
	const map = makeMap(8, 8)
	map.layers.units[0] = unit(0, 0)
	map.layers.units[1] = unit(0, 0)
	map.layers.buildings[8] = building(REFINERY, 0)
	map.layers.units[7] = unit(0, 1)
	map.layers.units[56] = unit(0, 2)
	map.layers.buildings[57] = building(REFINERY, 2)
	map.layers.units[63] = unit(0, 3)
	return map
}

/** The viewer's own instant path: apply an action, then resolve any new defeat. */
const replay = (map: MapObject, actions: SerializedAction[]): Set<number> => {
	const defeatedTeams = new Set<number>()
	for (const action of actions) {
		dispatchSerializedAction(map, action)
		for (const player of get(gameState).players) {
			if (player.hasLost && !defeatedTeams.has(player.team)) {
				defeatedTeams.add(player.team)
				resolveTeamDefeat(map, player.team)
			}
		}
	}
	return defeatedTeams
}

describe('replay defeat cleanup', () => {
	it("clears a surrendered team's army and neutralizes its buildings mid-log", () => {
		const map = fourTeamMap()
		initGameStateFromMap(map)

		const resolved = replay(map, [
			{ kind: 'surrender', team: 0 },
			{ kind: 'end-turn' },
			{ kind: 'end-turn' },
			{ kind: 'surrender', team: 2 },
			{ kind: 'end-turn' },
		])

		expect([...resolved].sort()).toEqual([0, 2])
		// Both resigned armies are off the board — no ghosts left standing.
		expect(map.layers.units[0]).toBeNull()
		expect(map.layers.units[1]).toBeNull()
		expect(map.layers.units[56]).toBeNull()
		// Their buildings survive but belong to nobody, so a later capture in the
		// log reads as neutral -> captor rather than dead team -> captor.
		expect(map.layers.buildings[8]?.team).toBe(NEUTRAL_TEAM)
		expect(map.layers.buildings[57]?.team).toBe(NEUTRAL_TEAM)
		// The two survivors are untouched.
		expect(map.layers.units[7]?.team).toBe(1)
		expect(map.layers.units[63]?.team).toBe(3)
	})

	it('rewinding to before the surrender puts the army back', () => {
		const map = fourTeamMap()
		const pristine: MapLayers = structuredClone(map.layers)
		initGameStateFromMap(map)

		const actions: SerializedAction[] = [
			{ kind: 'end-turn' },
			{ kind: 'end-turn' },
			{ kind: 'end-turn' },
			{ kind: 'end-turn' },
			{ kind: 'surrender', team: 0 },
		]
		replay(map, actions)
		expect(map.layers.units[0]).toBeNull()

		// Seek backward the way the viewer does: restore the pristine layers, re-seed
		// the engine, drop the resolved-defeat ledger, and re-apply the prefix.
		map.layers = structuredClone(pristine)
		initGameStateFromMap(map)
		replay(map, actions.slice(0, 4))

		expect(map.layers.units[0]?.team).toBe(0)
		expect(map.layers.units[1]?.team).toBe(0)
		expect(map.layers.buildings[8]?.team).toBe(0)
		expect(get(gameState).players.find((p) => p.team === 0)?.hasLost).toBe(false)
	})
})
