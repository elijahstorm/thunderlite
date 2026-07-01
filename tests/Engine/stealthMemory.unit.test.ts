// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import {
	recordStealthBuild,
	recordStealthDeath,
	recordStealthPassthrough,
	observeStealthSightings,
	lurkingStealthCount,
	decayStealthSuspicion,
	clearSearchedSuspicion,
	noteStealthSighting,
	noteStealthRevealed,
	recordPerceivedStealth,
	strongestSuspicion,
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

describe('recordStealthPassthrough — radar catches a cloaked unit mid-route', () => {
	const JAMMER_TRUCK = unitIndex('Jammer Truck')

	const seedTwoTeams = (map: MapObject) => {
		map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[map.cols * map.rows - 1] = unit(STRIKE_COMMANDO, 1)
		initGameStateFromMap(map)
	}

	it("floors the jammer owner's memory when the route crosses its ring", () => {
		const map = makeMap(8, 1)
		seedTwoTeams(map)
		map.layers.units[0] = unit(JAMMER_TRUCK, 0) // ring is 2..3 tiles out
		const mover = unit(STEALTH_TANK, 1)
		// Route runs 5 → 4 → 3 → 2: tiles 3 and 2 sit inside the ring (dist 3 and 2).
		recordStealthPassthrough(map, [5, 4, 3, 2], mover)
		expect(memOf(0, 1)).toBe(1)
	})

	it('records nothing when the route stays clear of every ring', () => {
		const map = makeMap(8, 1)
		seedTwoTeams(map)
		map.layers.units[0] = unit(JAMMER_TRUCK, 0)
		const mover = unit(STEALTH_TANK, 1)
		// Tiles 7 → 6 → 5: all beyond the 2..3 ring (dist 7,6,5).
		recordStealthPassthrough(map, [7, 6, 5], mover)
		expect(memOf(0, 1)).toBe(0)
	})

	it('never lowers a richer estimate already built from witnessed builds', () => {
		const map = makeMap(8, 1)
		seedTwoTeams(map)
		map.layers.units[0] = unit(JAMMER_TRUCK, 0)
		recordStealthBuild(map, 4, 1)
		recordStealthBuild(map, 4, 1)
		expect(memOf(0, 1)).toBe(2)
		recordStealthPassthrough(map, [3, 2], unit(STEALTH_TANK, 1))
		expect(memOf(0, 1)).toBe(2)
	})

	it('ignores non-stealth movers', () => {
		const map = makeMap(8, 1)
		seedTwoTeams(map)
		map.layers.units[0] = unit(JAMMER_TRUCK, 0)
		recordStealthPassthrough(map, [3, 2], unit(STRIKE_COMMANDO, 1))
		expect(memOf(0, 1)).toBe(0)
	})

	it('plants a location hunch the planner can read back', () => {
		const map = makeMap(8, 1)
		seedTwoTeams(map)
		map.layers.units[0] = unit(JAMMER_TRUCK, 0)
		recordStealthPassthrough(map, [5, 4, 3, 2], unit(STEALTH_TANK, 1))
		const focus = strongestSuspicion(0)
		// Tiles 3 and 2 were inside the ring; the hunch points at one of them.
		expect(focus).not.toBeNull()
		expect([2, 3]).toContain(focus!.tile)
	})
})

describe('stealth suspicion — fuzzy decay and spread', () => {
	const JAMMER_TRUCK = unitIndex('Jammer Truck')

	it('a witnessed build seeds a hunch at the spawn tile', () => {
		const map = makeMap(7, 1)
		map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[6] = unit(STRIKE_COMMANDO, 1)
		initGameStateFromMap(map)
		recordStealthBuild(map, 3, 1)
		expect(strongestSuspicion(0)?.tile).toBe(3)
	})

	it('decays and bleeds the hunch into neighbours over a turn', () => {
		const map = makeMap(7, 1)
		map.layers.units[0] = unit(JAMMER_TRUCK, 0)
		map.layers.units[6] = unit(STRIKE_COMMANDO, 1)
		initGameStateFromMap(map)
		// Plant a sharp pin at tile 3 via a radar flush.
		recordStealthPassthrough(map, [3], unit(STEALTH_TANK, 1))
		const before = strongestSuspicion(0)!.heat
		decayStealthSuspicion(map, 0)
		const after = strongestSuspicion(0)!
		// The peak dropped (decay) and the cloud now also covers a neighbour (spread).
		expect(after.heat).toBeLessThan(before)
		const heatMap = get(gameState).players.find((p) => p.team === 0)?.stealthSuspicion ?? {}
		expect(Object.keys(heatMap).length).toBeGreaterThan(1)
	})

	it('eventually forgets a stale hunch entirely', () => {
		const map = makeMap(7, 1)
		map.layers.units[0] = unit(JAMMER_TRUCK, 0)
		map.layers.units[6] = unit(STRIKE_COMMANDO, 1)
		initGameStateFromMap(map)
		recordStealthPassthrough(map, [3], unit(STEALTH_TANK, 1))
		for (let i = 0; i < 20; i++) decayStealthSuspicion(map, 0)
		expect(strongestSuspicion(0)).toBeNull()
	})

	it('never lets heat blow up past the seed value (conserving diffusion)', () => {
		const map = makeMap(7, 1)
		map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[6] = unit(STRIKE_COMMANDO, 1)
		initGameStateFromMap(map)
		// Seed a tight cluster, then age it many turns — a non-conserving blur would
		// compound the centre tile above 1; this must stay capped and trend down.
		noteStealthSighting(0, 1, [2, 3, 4])
		let prevPeak = strongestSuspicion(0)!.heat
		for (let i = 0; i < 6; i++) {
			decayStealthSuspicion(map, 0)
			const peak = strongestSuspicion(0)?.heat ?? 0
			expect(peak).toBeLessThanOrEqual(1.0001)
			expect(peak).toBeLessThanOrEqual(prevPeak + 1e-9)
			prevPeak = peak
		}
	})
})

describe('clearSearchedSuspicion — rule out swept tiles', () => {
	const JAMMER_TRUCK = unitIndex('Jammer Truck')

	it('clears a suspected tile a friendly unit stands next to and finds empty', () => {
		const map = makeMap(7, 1)
		// Observer team 0 already on the board (so the player record exists), with its
		// searcher point-blank to the hunch at tile 3, which is empty.
		map.layers.units[2] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[6] = unit(STRIKE_COMMANDO, 1)
		initGameStateFromMap(map)
		noteStealthSighting(0, 1, [3])
		expect(strongestSuspicion(0)?.tile).toBe(3)
		clearSearchedSuspicion(map, 0)
		expect(strongestSuspicion(0)).toBeNull()
	})

	it('keeps the hunch where a swept tile actually holds an enemy', () => {
		const map = makeMap(7, 1)
		map.layers.units[2] = unit(STRIKE_COMMANDO, 0) // observer, adjacent to 3
		map.layers.units[3] = unit(STEALTH_TANK, 1) // the threat is really there
		initGameStateFromMap(map)
		noteStealthSighting(0, 1, [3])
		expect(strongestSuspicion(0)?.tile).toBe(3)
		clearSearchedSuspicion(map, 0)
		expect(strongestSuspicion(0)?.tile).toBe(3)
	})

	it('clears tiles swept by a radar ring', () => {
		const map = makeMap(8, 1)
		map.layers.units[0] = unit(JAMMER_TRUCK, 0) // ring 2..3 covers tile 3 (dist 3)
		map.layers.units[7] = unit(STRIKE_COMMANDO, 1)
		initGameStateFromMap(map)
		noteStealthSighting(0, 1, [3]) // hunch at tile 3
		expect(strongestSuspicion(0)?.tile).toBe(3)
		clearSearchedSuspicion(map, 0)
		expect(strongestSuspicion(0)).toBeNull()
	})
})

describe('reveal-on-contact and reveal-on-attack feed the hunch', () => {
	it('recordPerceivedStealth pins a stealth unit flushed open beside an observer', () => {
		const map = makeMap(7, 1)
		map.layers.units[2] = unit(STRIKE_COMMANDO, 0) // observer
		map.layers.units[3] = unit(STEALTH_TANK, 1) // adjacent → flushed into the open
		initGameStateFromMap(map)
		recordPerceivedStealth(map)
		expect(memOf(0, 1)).toBe(1)
		expect(strongestSuspicion(0)?.tile).toBe(3)
	})

	it('recordPerceivedStealth leaves a still-concealed stealth unit unknown', () => {
		const map = makeMap(7, 1)
		map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[4] = unit(STEALTH_TANK, 1) // far away, nothing flushing it
		initGameStateFromMap(map)
		recordPerceivedStealth(map)
		expect(memOf(0, 1)).toBe(0)
		expect(strongestSuspicion(0)).toBeNull()
	})

	it('noteStealthRevealed pins the firing tile for every rival team', () => {
		const map = makeMap(7, 1)
		map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[6] = unit(STRIKE_COMMANDO, 1)
		initGameStateFromMap(map)
		// A stealth tank attacks from tile 4 — even if it re-cloaks at once, the victim
		// side now knows it exists and where it struck.
		noteStealthRevealed(map, 4, unit(STEALTH_TANK, 1))
		expect(memOf(0, 1)).toBe(1)
		expect(strongestSuspicion(0)?.tile).toBe(4)
	})
})
