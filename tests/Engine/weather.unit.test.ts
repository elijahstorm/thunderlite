// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { skyData } from '../../src/lib/GameData/sky'
import { terrainData } from '../../src/lib/GameData/terrain'
import { unitData } from '../../src/lib/GameData/unit'
import { applySkyEndOfTurnDamage, STORM_DAMAGE } from '../../src/lib/Engine/turnLoop'
import { applySkyHiding, isAirHiddenBySky } from '../../src/lib/Engine/visibility'
import { generateMovementList } from '../../src/lib/Engine/Interactor/Pathing/movement'

const terrainIndex = (name: string) => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`unknown terrain: ${name}`)
	return idx
}

const unitIndex = (name: string) => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`unknown unit: ${name}`)
	return idx
}

const skyIndex = (name: string) => {
	const idx = skyData.findIndex((s) => s.name === name)
	if (idx < 0) throw new Error(`unknown sky: ${name}`)
	return idx
}

const PLAINS = terrainIndex('Plains')
const RAPTOR_FIGHTER = unitIndex('Raptor Fighter')
const STRIKE_COMMANDO = unitIndex('Strike Commando')
const CLOUD = skyIndex('Cloud')
const STORM = skyIndex('Storm')

const ground = (type: number): GroundObject => ({ type, state: 0 })
const unit = (type: number, team = 0): UnitObject => ({ type, state: 0, team })
const sky = (type: number): SkyObject => ({ type, state: 0 })

const makeMap = (cols: number, rows: number): MapObject => ({
	cols,
	rows,
	layers: {
		ground: new Array(cols * rows).fill(0).map(() => ground(PLAINS)),
		sky: new Array(cols * rows).fill(null),
		units: new Array(cols * rows).fill(null),
		buildings: new Array(cols * rows).fill(null),
	},
	filters: {
		ground: () => [],
		sky: () => [],
		units: () => [],
		buildings: () => [],
	},
	route: new Array(cols * rows).fill(undefined),
	highlights: new Array(cols * rows).fill(undefined),
})

describe('Cloud hides air units', () => {
	it('isAirHiddenBySky returns true for a Raptor under a cloud', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.sky[tile] = sky(CLOUD)
		map.layers.units[tile] = unit(RAPTOR_FIGHTER, 0)
		expect(isAirHiddenBySky(map, tile, map.layers.units[tile]!)).toBe(true)
	})

	it('isAirHiddenBySky returns false for a ground unit', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.sky[tile] = sky(CLOUD)
		map.layers.units[tile] = unit(STRIKE_COMMANDO, 0)
		expect(isAirHiddenBySky(map, tile, map.layers.units[tile]!)).toBe(false)
	})

	it('applySkyHiding marks a Raptor under a cloud as hidden', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.sky[tile] = sky(CLOUD)
		map.layers.units[tile] = unit(RAPTOR_FIGHTER, 0)
		applySkyHiding(map, 0)
		expect(map.layers.units[tile]!.hidden).toBe(true)
	})

	it('applySkyHiding does not hide a Raptor when an enemy is adjacent', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.sky[tile] = sky(CLOUD)
		map.layers.units[tile] = unit(RAPTOR_FIGHTER, 0)
		map.layers.units[tile + 1] = unit(STRIKE_COMMANDO, 1)
		applySkyHiding(map, 0)
		expect(map.layers.units[tile]!.hidden).toBe(false)
	})

	it('applySkyHiding also hides air units under a storm', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.sky[tile] = sky(STORM)
		map.layers.units[tile] = unit(RAPTOR_FIGHTER, 0)
		applySkyHiding(map, 0)
		expect(map.layers.units[tile]!.hidden).toBe(true)
	})
})

describe('Storm damages air units at end of turn', () => {
	it('deals 10 HP to a Raptor ending its turn under a storm', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.sky[tile] = sky(STORM)
		const r = unit(RAPTOR_FIGHTER, 0)
		r.health = 50
		map.layers.units[tile] = r
		const events = applySkyEndOfTurnDamage(map, 0)
		expect(events.length).toBe(1)
		expect(events[0].damage).toBe(STORM_DAMAGE)
		expect(map.layers.units[tile]!.health).toBe(40)
	})

	it('does not damage a Raptor under a cloud (not treacherous)', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.sky[tile] = sky(CLOUD)
		const r = unit(RAPTOR_FIGHTER, 0)
		r.health = 50
		map.layers.units[tile] = r
		const events = applySkyEndOfTurnDamage(map, 0)
		expect(events.length).toBe(0)
		expect(map.layers.units[tile]!.health).toBe(50)
	})

	it('kills a Raptor at 10 HP standing under a storm', () => {
		const map = makeMap(5, 5)
		const tile = 2 * 5 + 2
		map.layers.sky[tile] = sky(STORM)
		const r = unit(RAPTOR_FIGHTER, 0)
		r.health = 10
		map.layers.units[tile] = r
		const events = applySkyEndOfTurnDamage(map, 0)
		expect(events[0].died).toBe(true)
		expect(map.layers.units[tile]).toBeNull()
	})

	it('only damages units of the requested team', () => {
		const map = makeMap(5, 5)
		const ours = 2 * 5 + 2
		const theirs = 2 * 5 + 3
		map.layers.sky[ours] = sky(STORM)
		map.layers.sky[theirs] = sky(STORM)
		const a = unit(RAPTOR_FIGHTER, 0)
		a.health = 50
		const b = unit(RAPTOR_FIGHTER, 1)
		b.health = 50
		map.layers.units[ours] = a
		map.layers.units[theirs] = b
		applySkyEndOfTurnDamage(map, 0)
		expect(a.health).toBe(40)
		expect(b.health).toBe(50)
	})
})

describe('Storm drag reduces air movement', () => {
	it('doubles movement cost for an air unit crossing a storm tile', () => {
		const map = makeMap(10, 1)
		const start = 0
		map.layers.sky[4] = sky(STORM)
		const r = unit(RAPTOR_FIGHTER, 0)
		map.layers.units[start] = r

		const reach = generateMovementList(map, start, r)
		const baseline = makeMap(10, 1)
		baseline.layers.units[start] = unit(RAPTOR_FIGHTER, 0)
		const reachNoStorm = generateMovementList(baseline, start, baseline.layers.units[start]!)

		expect(reach.length).toBeLessThan(reachNoStorm.length)
	})

	it('does not affect movement for cloud (drag is only treacherous)', () => {
		const map = makeMap(10, 1)
		const start = 0
		map.layers.sky[4] = sky(CLOUD)
		const r = unit(RAPTOR_FIGHTER, 0)
		map.layers.units[start] = r

		const reachWithCloud = generateMovementList(map, start, r)

		const baseline = makeMap(10, 1)
		baseline.layers.units[start] = unit(RAPTOR_FIGHTER, 0)
		const reachNoSky = generateMovementList(baseline, start, baseline.layers.units[start]!)

		expect(reachWithCloud.length).toBe(reachNoSky.length)
	})
})
