// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import {
	recordStealthBuild,
	recordStealthDeath,
	observeStealthSightings,
	lurkingStealthCount,
} from '../../src/lib/Engine/cpuAi/stealthMemory'
import { terrainData } from '../../src/lib/GameData/terrain'
import { unitData } from '../../src/lib/GameData/unit'

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

const PLAINS = terrainIndex('Plains')
const STRIKE_COMMANDO = unitIndex('Strike Commando')
const STEALTH_TANK = unitIndex('Stealth Tank')

const ground = (type: number): GroundObject => ({ type, state: 0 })
const unit = (type: number, team = 0): UnitObject => ({ type, state: 0, team })

const makeMap = (cols: number, rows: number): MapObject => ({
	cols,
	rows,
	layers: {
		ground: new Array(cols * rows).fill(0).map(() => ground(PLAINS)),
		sky: new Array(cols * rows).fill(null),
		units: new Array(cols * rows).fill(null),
		buildings: new Array(cols * rows).fill(null),
	},
	filters: { ground: () => [], sky: () => [], units: () => [], buildings: () => [] },
	route: new Array(cols * rows).fill(undefined),
	highlights: new Array(cols * rows).fill(undefined),
})

const memOf = (observer: number, target: number): number =>
	get(gameState).players.find((p) => p.team === observer)?.stealthMemory?.[target] ?? 0

// A map seeded with one unit per team so initGameStateFromMap derives both players.
const twoTeamMap = (): MapObject => {
	const map = makeMap(7, 1)
	map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
	map.layers.units[6] = unit(STRIKE_COMMANDO, 1)
	initGameStateFromMap(map)
	return map
}

describe('stealth memory — build/death witnessing (fog off → everyone sees)', () => {
	let map: MapObject
	beforeEach(() => {
		map = twoTeamMap()
	})

	it('a witnessed enemy build raises the observer\'s tally for that team', () => {
		recordStealthBuild(map, 3, 1)
		expect(memOf(0, 1)).toBe(1)
		// The builder doesn't remember its own units.
		expect(memOf(1, 1)).toBe(0)
	})

	it('accumulates builds and is trimmed by witnessed deaths, clamped at zero', () => {
		recordStealthBuild(map, 3, 1)
		recordStealthBuild(map, 4, 1)
		expect(memOf(0, 1)).toBe(2)
		recordStealthDeath(map, 3, 1)
		expect(memOf(0, 1)).toBe(1)
		recordStealthDeath(map, 4, 1)
		recordStealthDeath(map, 4, 1)
		expect(memOf(0, 1)).toBe(0)
	})
})

describe('stealth memory — sighting floor', () => {
	it('raises memory to the count of currently-revealed enemy stealth units', () => {
		const map = makeMap(7, 1)
		map.layers.units[2] = unit(STRIKE_COMMANDO, 0) // observer's unit
		map.layers.units[3] = unit(STEALTH_TANK, 1) // adjacent to (2) → revealed
		initGameStateFromMap(map)
		observeStealthSightings(map, 0)
		expect(memOf(0, 1)).toBe(1)
	})

	it('does not count a cloaked (unrevealed) stealth unit', () => {
		const map = makeMap(7, 1)
		map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[4] = unit(STEALTH_TANK, 1) // no adjacent enemy → cloaked
		initGameStateFromMap(map)
		observeStealthSightings(map, 0)
		expect(memOf(0, 1)).toBe(0)
	})

	it('never lowers an existing memory (a unit slipping out of sight is not a death)', () => {
		const map = twoTeamMap()
		recordStealthBuild(map, 3, 1)
		recordStealthBuild(map, 4, 1)
		expect(memOf(0, 1)).toBe(2)
		observeStealthSightings(map, 0) // sees none revealed, but must not drop the tally
		expect(memOf(0, 1)).toBe(2)
	})
})

describe('lurkingStealthCount', () => {
	it('is the remembered count minus what is currently revealed', () => {
		const map = makeMap(7, 1)
		map.layers.units[2] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[3] = unit(STEALTH_TANK, 1) // revealed (adjacent)
		initGameStateFromMap(map)
		// Pretend the CPU remembers three of team 1's stealth units.
		recordStealthBuild(map, 5, 1)
		recordStealthBuild(map, 5, 1)
		recordStealthBuild(map, 5, 1)
		expect(memOf(0, 1)).toBe(3)
		// One is in plain sight, so only two are unaccounted-for lurkers.
		expect(lurkingStealthCount(map, 0)).toBe(2)
	})

	it('is zero when there is no memory', () => {
		const map = twoTeamMap()
		expect(lurkingStealthCount(map, 0)).toBe(0)
	})
})
