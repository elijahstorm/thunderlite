// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, resetGameState, markTileActed } from '../../src/lib/Engine/gameState'
import { teamHasPendingActions } from '../../src/lib/Engine/pendingActions'

const WARFACTORY = 4 // GameData/building.ts — the only `actable: true` entry
const GROUND_UNIT = 0 // GameData/unit.ts — Strike Commando, a ground unit costing 75

const makeMap = (overrides: Partial<MapProcesser> = {}): MapProcesser => ({
	cols: 4,
	rows: 4,
	layers: {
		ground: new Array(16).fill(0).map(() => ({ type: 0, state: 0 })),
		sky: new Array(16).fill(null),
		units: new Array(16).fill(null),
		buildings: new Array(16).fill(null),
	},
	...overrides,
})

const unit = (team: number, type = GROUND_UNIT): UnitObject => ({ type, state: 0, team })
const building = (team: number, type = WARFACTORY): BuildingObject => ({ type, state: 0, team })

// Seed the store directly so each test controls money/controls precisely.
const seed = (currentTeam: number, money: number, ground: boolean) => {
	gameState.set({
		players: [
			{ team: currentTeam, money, hasLost: false, controls: { ground, air: false, sea: false } },
		],
		currentTeam,
		turnNumber: 1,
		actedTiles: new Set<number>(),
		phase: 'playing',
	})
}

describe('teamHasPendingActions', () => {
	beforeEach(() => resetGameState())

	it('is true while an owned unit has not acted', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		seed(0, 0, false)

		expect(teamHasPendingActions(map)).toBe(true)
	})

	it('is false once every owned unit has acted and there are no buildings', () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[5] = unit(0)
		seed(0, 0, false)
		markTileActed(0)
		markTileActed(5)

		expect(teamHasPendingActions(map)).toBe(false)
	})

	it("ignores other teams' unacted units", () => {
		const map = makeMap()
		map.layers.units[0] = unit(0)
		map.layers.units[5] = unit(1)
		seed(0, 0, false)
		markTileActed(0)

		expect(teamHasPendingActions(map)).toBe(false)
	})

	it('is true for an unacted factory the owner can afford to build from', () => {
		const map = makeMap()
		map.layers.buildings[2] = building(0)
		seed(0, 1000, true)

		expect(teamHasPendingActions(map)).toBe(true)
	})

	it('is false when the only factory is unaffordable', () => {
		const map = makeMap()
		map.layers.buildings[2] = building(0)
		seed(0, 0, true) // owns ground control but is broke

		expect(teamHasPendingActions(map)).toBe(false)
	})

	it('is false when the owner cannot build the units the factory makes', () => {
		const map = makeMap()
		map.layers.buildings[2] = building(0)
		seed(0, 1000, false) // has money but no ground control

		expect(teamHasPendingActions(map)).toBe(false)
	})

	it('is false when the factory has already acted', () => {
		const map = makeMap()
		map.layers.buildings[2] = building(0)
		seed(0, 1000, true)
		markTileActed(2)

		expect(teamHasPendingActions(map)).toBe(false)
	})

	it('does not count a factory standing under a unit (the unit takes priority)', () => {
		const map = makeMap()
		map.layers.buildings[2] = building(0)
		map.layers.units[2] = unit(0)
		seed(0, 1000, true)
		markTileActed(2) // the occupying unit has finished, so it's not pending either

		expect(teamHasPendingActions(map)).toBe(false)
	})
})
