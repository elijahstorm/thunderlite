// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { gameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import {
	recordStealthBuild,
	strongestSuspicion,
} from '../../src/lib/Engine/cpuAi/stealthMemory'
import { scoreStealthHunt } from '../../src/lib/Engine/cpuAi/score'
import { rankBuildableTypes } from '../../src/lib/Engine/cpuAi/production'
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
const STRIKE_COMMANDO = unitIndex('Strike Commando') // cheap, mobile, has sight → good probe
const ANNIHILATOR = unitIndex('Annihilator Tank') // expensive, slow → poor probe
const JAMMER_TRUCK = unitIndex('Jammer Truck')

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

// Two-team seed so initGameStateFromMap derives both players.
const seed = (map: MapObject) => {
	map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
	map.layers.units[map.cols * map.rows - 1] = unit(STRIKE_COMMANDO, 1)
	initGameStateFromMap(map)
}

describe('scoreStealthHunt', () => {
	let map: MapObject
	beforeEach(() => {
		map = makeMap(10, 1)
		seed(map)
		// Plant a hunch at tile 5.
		recordStealthBuild(map, 5, 1)
		expect(strongestSuspicion(0)?.tile).toBe(5)
	})

	it('is zero when nothing is lurking', () => {
		expect(scoreStealthHunt(map, 4, unit(STRIKE_COMMANDO, 0), 0, 0)).toBe(0)
	})

	it('pulls a cheap probe toward the hunch (closer scores higher)', () => {
		const probe = unit(STRIKE_COMMANDO, 0)
		const near = scoreStealthHunt(map, 4, probe, 0, 1) // 1 tile from hunch
		const far = scoreStealthHunt(map, 9, probe, 0, 1) // 4 tiles away
		expect(near).toBeGreaterThan(far)
		expect(far).toBeGreaterThanOrEqual(0)
	})

	it('barely diverts an expensive heavyweight on the long approach', () => {
		// At approach range (dist 3 here) cheap probes lead; a heavyweight shouldn't
		// wander off-objective chasing a rumour. (The final flush step is open to all —
		// see the dedicated flush test.)
		const heavy = unit(ANNIHILATOR, 0)
		const probe = unit(STRIKE_COMMANDO, 0)
		const heavyPull = scoreStealthHunt(map, 2, heavy, 0, 1) // dist 3 from hunch at 5
		const probePull = scoreStealthHunt(map, 2, probe, 0, 1)
		expect(heavyPull).toBeLessThan(probePull)
	})

	it('rewards a Jammer Truck most for landing its radar ring on the hunch', () => {
		const jammer = unit(JAMMER_TRUCK, 0)
		// Ring is 2..3 out: tile 2 → distance 3 to the hunch at 5 (covers it);
		// tile 5 → distance 0 (inside the blind inner gap, does NOT cover).
		const covering = scoreStealthHunt(map, 2, jammer, 0, 1)
		const onTopButBlind = scoreStealthHunt(map, 5, jammer, 0, 1)
		expect(covering).toBeGreaterThan(onTopButBlind)
	})

	it('strongly rewards ANY unit for a move that ends adjacent to the hunch (flush)', () => {
		// Even a heavyweight (poor "probe") should value the actual reveal: tile 4 is
		// adjacent to the hunch at 5 (flush), tile 2 is three away (mere approach).
		const heavy = unit(ANNIHILATOR, 0)
		const flush = scoreStealthHunt(map, 4, heavy, 0, 1)
		const approach = scoreStealthHunt(map, 2, heavy, 0, 1)
		expect(flush).toBeGreaterThan(approach)
		expect(flush).toBeGreaterThan(5)
	})
})

describe('production prioritises radar when stealth is suspected', () => {
	const jammerScore = (map: MapObject, cpuTeam: number): number => {
		const ranked = rankBuildableTypes(map, cpuTeam, { ignoreControls: true, budget: 5000 })
		return ranked.find((r) => r.type === JAMMER_TRUCK)?.score ?? -Infinity
	}

	it('boosts the Jammer Truck once the CPU remembers a lurking cloak unit', () => {
		const map = makeMap(8, 1)
		seed(map)
		const before = jammerScore(map, 0)
		// CPU witnesses an enemy stealth build → it now has a lurking threat in memory.
		recordStealthBuild(map, 4, 1)
		const after = jammerScore(map, 0)
		expect(after).toBeGreaterThan(before)
	})

	it('does not keep boosting once the CPU already fields a jammer', () => {
		const map = makeMap(8, 1)
		map.layers.units[0] = unit(STRIKE_COMMANDO, 0)
		map.layers.units[2] = unit(JAMMER_TRUCK, 0) // CPU already has radar
		map.layers.units[7] = unit(STRIKE_COMMANDO, 1)
		initGameStateFromMap(map)
		const before = jammerScore(map, 0)
		recordStealthBuild(map, 4, 1)
		const after = jammerScore(map, 0)
		// One jammer already on the board → still some boost, but not the first-radar spike.
		expect(after - before).toBeLessThan(220)
	})
})
