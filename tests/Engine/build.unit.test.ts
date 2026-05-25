// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { buildableUnits, spawnBuiltUnit } from '../../src/lib/Engine/build'
import { unitData } from '../../src/lib/GameData/unit'
import { buildingData } from '../../src/lib/GameData/building'

const WARFACTORY_TYPE = buildingData.findIndex((b) => b.name === 'Warfactory')
const SCORPION_TANK_TYPE = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const RAPTOR_FIGHTER_TYPE = unitData.findIndex((u) => u.name === 'Raptor Fighter')

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
			controls: { ground: false, air: false, sea: false },
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
			controls: { ground: true, air: false, sea: false },
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
			controls: { ground: true, air: false, sea: false },
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
			controls: { ground: true, air: true, sea: true },
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
			controls: { ground: true, air: false, sea: false },
		}
		const groundList = buildableUnits(groundOnly)
		const raptor = groundList.find((e) => e.type === RAPTOR_FIGHTER_TYPE)
		expect(raptor).toBeDefined()
		expect(raptor?.controlled).toBe(false)
		expect(raptor?.buildable).toBe(false)

		const withAir = {
			money: 9999,
			controls: { ground: true, air: true, sea: false },
		}
		const withAirList = buildableUnits(withAir)
		const raptorWithAir = withAirList.find((e) => e.type === RAPTOR_FIGHTER_TYPE)
		expect(raptorWithAir?.controlled).toBe(true)
		expect(raptorWithAir?.buildable).toBe(true)
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
				p.team === 0
					? { ...p, money: 270, controls: { ground: true, air: false, sea: false } }
					: p
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

	it('refuses to spawn when the player cannot afford the unit', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0
					? { ...p, money: 10, controls: { ground: true, air: false, sea: false } }
					: p
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
					? { ...p, money: 9999, controls: { ground: false, air: false, sea: false } }
					: p
			),
		}))

		const result = spawnBuiltUnit(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('not-buildable')
	})

	it('spawns into an adjacent tile when the building tile is occupied', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		map.layers.units[5] = { type: 0, state: 0, team: 0 }
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0
					? { ...p, money: 270, controls: { ground: true, air: false, sea: false } }
					: p
			),
		}))

		const result = spawnBuiltUnit(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(true)
		if (result.ok) {
			expect([1, 4, 6, 9]).toContain(result.tile)
			expect(map.layers.units[result.tile]?.type).toBe(SCORPION_TANK_TYPE)
		}
	})

	it('fails when neither the building tile nor any adjacent tile is free', () => {
		const map = makeMap()
		map.layers.buildings[5] = building(0, WARFACTORY_TYPE)
		for (const t of [5, 1, 4, 6, 9]) {
			map.layers.units[t] = { type: 0, state: 0, team: 0 }
		}
		initGameStateFromMap(map)
		gameState.update((s) => ({
			...s,
			players: s.players.map((p) =>
				p.team === 0
					? { ...p, money: 270, controls: { ground: true, air: false, sea: false } }
					: p
			),
		}))

		const result = spawnBuiltUnit(map, 5, SCORPION_TANK_TYPE, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('no-space')
		expect(get(gameState).players.find((p) => p.team === 0)?.money).toBe(270)
	})
})
