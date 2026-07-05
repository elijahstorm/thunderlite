// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { buildableUnits, discountedUnitCost, spawnBuiltUnit } from '../../src/lib/Engine/build'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'
import { terrainData } from '../../src/lib/GameData/terrain'

const WARFACTORY_TYPE = buildingData.findIndex((b) => b.name === 'Warfactory')
const SCORPION_TANK_TYPE = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const RAPTOR_FIGHTER_TYPE = unitData.findIndex((u) => u.name === 'Raptor Fighter')
const CORVETTE_TYPE = unitData.findIndex((u) => u.name === 'Corvette')
const MOUNTAIN = terrainData.findIndex((t) => t.name === 'Mountain')
const SHORE = terrainData.findIndex((t) => t.name === 'Shore')

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

const building = (team: number, type: number): BuildingObject => ({ type, state: 0, team })

describe('buildableUnits', () => {
	it('marks every entry as non-buildable when no controls are unlocked', () => {
		const player = {
			money: 9999,
			controls: { ground: 0, air: 0, sea: 0 },
		}
		const list = buildableUnits(player)
		expect(list.length).toBeGreaterThan(0)
		for (const entry of list) {
			expect(entry.controlled).toBe(false)
			expect(entry.buildable).toBe(false)
		}
	})

	it('marks only ground units as buildable when only ground control is set', () => {
		const player = {
			money: 9999,
			controls: { ground: 1, air: 0, sea: 0 },
		}
		const list = buildableUnits(player)
		expect(list.length).toBeGreaterThan(0)
		for (const entry of list) {
			if (entry.data.type === 'ground') {
				expect(entry.controlled).toBe(true)
				expect(entry.buildable).toBe(true)
			} else {
				expect(entry.controlled).toBe(false)
				expect(entry.buildable).toBe(false)
			}
		}
	})

	it('marks unaffordable units as not affordable but still in the list', () => {
		const player = {
			money: 50,
			controls: { ground: 1, air: 0, sea: 0 },
		}
		const list = buildableUnits(player)
		for (const entry of list) {
			if (entry.data.cost > 50) {
				expect(entry.affordable).toBe(false)
				expect(entry.buildable).toBe(false)
			} else {
				expect(entry.affordable).toBe(true)
			}
		}
		expect(list.some((e) => e.type === SCORPION_TANK_TYPE)).toBe(true)
	})

	it('excludes zero-cost units (Turret, Blockade, Leviathan, Transporter)', () => {
		const player = {
			money: 9999,
			controls: { ground: 1, air: 1, sea: 1 },
		}
		const list = buildableUnits(player)
		for (const entry of list) expect(entry.data.cost).toBeGreaterThan(0)
		const names = list.map((e) => e.data.name)
		expect(names).not.toContain('Turret')
		expect(names).not.toContain('Blockade')
		expect(names).not.toContain('Leviathan')
		expect(names).not.toContain('Transporter')
	})

	it('treats missing controls as no categories unlocked', () => {
		const list = buildableUnits({ money: 9999 })
		expect(list.length).toBeGreaterThan(0)
		for (const entry of list) {
			expect(entry.controlled).toBe(false)
			expect(entry.buildable).toBe(false)
		}
	})

	it('shows air units as locked (not buildable) without air control', () => {
		const groundOnly = {
			money: 9999,
			controls: { ground: 1, air: 0, sea: 0 },
		}
		const groundList = buildableUnits(groundOnly)
		const raptor = groundList.find((e) => e.type === RAPTOR_FIGHTER_TYPE)
		expect(raptor).toBeDefined()
		expect(raptor?.controlled).toBe(false)
		expect(raptor?.buildable).toBe(false)

		const withAir = {
			money: 9999,
			controls: { ground: 1, air: 1, sea: 0 },
		}
		const withAirList = buildableUnits(withAir)
		const raptorWithAir = withAirList.find((e) => e.type === RAPTOR_FIGHTER_TYPE)
		expect(raptorWithAir?.controlled).toBe(true)
		expect(raptorWithAir?.buildable).toBe(true)
	})
})

describe('control building discount', () => {
	const SCORPION = unitData[SCORPION_TANK_TYPE]

	it('charges full price with a single control building', () => {
		const player = { controls: { ground: 1, air: 0, sea: 0 } }
		expect(discountedUnitCost(player, SCORPION)).toBe(SCORPION.cost)
	})

	it('discounts 10% per extra control building, on the 5-credit grid', () => {
		const player = { controls: { ground: 2, air: 0, sea: 0 } }
		// Scorpion Tank is 270; 10% off is 243, which lands on 245.
		expect(discountedUnitCost(player, SCORPION)).toBe(245)
		const three = { controls: { ground: 3, air: 0, sea: 0 } }
		// 20% off 270 is 216, which lands on 215.
		expect(discountedUnitCost(three, SCORPION)).toBe(215)
	})

	it('caps the discount at 50%', () => {
		const player = { controls: { ground: 20, air: 0, sea: 0 } }
		expect(discountedUnitCost(player, SCORPION)).toBe(SCORPION.cost / 2)
	})

	it('only discounts the matching unit category', () => {
		const player = { controls: { ground: 3, air: 1, sea: 0 } }
		const raptor = unitData[RAPTOR_FIGHTER_TYPE]
		expect(discountedUnitCost(player, raptor)).toBe(raptor.cost)
	})

	it('applies to buildableUnits affordability from main money', () => {
		const player = { money: 245, controls: { ground: 2, air: 0, sea: 0 } }
		const entry = buildableUnits(player).find((e) => e.type === SCORPION_TANK_TYPE)
		expect(entry?.cost).toBe(245)
		expect(entry?.affordable).toBe(true)
		expect(entry?.buildable).toBe(true)
	})

	it('never applies on the Warmachine wallet path (ignoreControls)', () => {
		const player = { money: 0, controls: { ground: 5, air: 5, sea: 5 } }
		const entry = buildableUnits(player, { budget: 9999, ignoreControls: true }).find(
			(e) => e.type === SCORPION_TANK_TYPE
		)
		expect(entry?.cost).toBe(SCORPION.cost)
	})
})

describe('spawnBuiltUnit', () => {
	beforeEach(() => {
		resetGameState()
	})

	it('spends money, places the unit, and marks it as acted', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, money: 270, controls: { ground: 1, air: 0, sea: 0 } } : p
			),
		}))

		const result = spawnBuiltUnit(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.tile).toBe(5)

		const state = get(gameState)
		expect(state.players.find((p) => p.team === 0)?.money).toBe(0)
		expect(map.layers.units[5]?.type).toBe(SCORPION_TANK_TYPE)
		expect(map.layers.units[5]?.team).toBe(0)
		expect(state.actedTiles.has(5)).toBe(true)
	})

	it('deducts the discounted price when the player holds extra ground controls', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				// 245 is exactly the two-control price of a 270 Scorpion Tank.
				p.team === 0 ? { ...p, money: 245, controls: { ground: 2, air: 0, sea: 0 } } : p
			),
		}))

		const result = spawnBuiltUnit(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(true)
		expect(get(gameState).players.find((p) => p.team === 0)?.money).toBe(0)
	})

	it('refuses to spawn when the player cannot afford the unit', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, money: 10, controls: { ground: 1, air: 0, sea: 0 } } : p
			),
		}))

		const result = spawnBuiltUnit(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('not-affordable')
		expect(map.layers.units[5]).toBeNull()
	})

	it('refuses to spawn when player lacks the required control', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0
					? { ...p, money: 9999, controls: { ground: 0, air: 0, sea: 0 } }
					: p
			),
		}))

		const result = spawnBuiltUnit(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('not-buildable')
	})

	it('fails with no-space when the factory tile is already occupied', () => {
		// A factory deploys onto its own tile, so an occupant blocks the build
		// outright — no spilling onto neighbours, which is what let a coastal factory
		// churn out extra units without ever being consumed.
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		map.layers.units[5] = { type: 0, state: 0, team: 0 }
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, money: 270, controls: { ground: 1, air: 0, sea: 0 } } : p
			),
		}))

		const result = spawnBuiltUnit(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('no-space')
		expect(get(gameState).players.find((p) => p.team === 0)?.money).toBe(270)
	})

	it('fails with no-space when the unit could never occupy the factory tile', () => {
		// A treaded tank can't perch on the mountain the factory sits on.
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		map.layers.ground[5].type = MOUNTAIN
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, money: 270, controls: { ground: 1, air: 0, sea: 0 } } : p
			),
		}))

		const result = spawnBuiltUnit(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('no-space')
		expect(get(gameState).players.find((p) => p.team === 0)?.money).toBe(270)
	})

	it('refuses to build a sea unit from a landlocked factory', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, money: 9999, controls: { ground: 0, air: 0, sea: 1 } } : p
			),
		}))

		const result = spawnBuiltUnit(map, 5, CORVETTE_TYPE, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('no-space')
		expect(map.layers.units[5]).toBeNull()
	})

	it('launches a sea unit onto a shore factory tile and consumes the factory', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		map.layers.ground[5].type = SHORE
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0 ? { ...p, money: 9999, controls: { ground: 0, air: 0, sea: 1 } } : p
			),
		}))

		const result = spawnBuiltUnit(map, 5, CORVETTE_TYPE, 0)
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.tile).toBe(5)
		expect(map.layers.units[5]?.type).toBe(CORVETTE_TYPE)
		expect(get(gameState).actedTiles.has(5)).toBe(true)
	})
})
