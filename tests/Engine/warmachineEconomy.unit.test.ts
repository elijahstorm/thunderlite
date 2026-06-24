// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../../src/lib/Audio/audioEngine', () => ({
	audioEngine: { playSfx: () => {} },
}))

import { gameState, resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { applyAction } from '../../src/lib/Engine/applyAction'
import { mine } from '../../src/lib/Engine/modifiers/miner'
import { isWalletUnit, walletOf, WARMACHINE_WALLET } from '../../src/lib/Engine/wallet'
import { bestPlanFor, generatePlansFor } from '../../src/lib/Engine/cpuAi/candidates'
import {
	scoreBuilderMine,
	scoreBuilderBuild,
	scoreBuilderPosition,
	scoreBuilderAttack,
	LOW_WALLET,
	FEW_ENEMIES,
	type AttackScore,
} from '../../src/lib/Engine/cpuAi/score'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'

const WARMACHINE_TYPE = unitData.findIndex((u) => u.name === 'Warmachine')
const SCORPION_TANK_TYPE = unitData.findIndex((u) => u.name === 'Scorpion Tank')
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const ENRICHED_ORE = terrainData.findIndex((t) => t.name === 'Enriched Ore Deposit')

const warmachine = (team: number, wallet?: number): UnitObject => ({
	type: WARMACHINE_TYPE,
	state: 0,
	team,
	health: unitData[WARMACHINE_TYPE].health,
	...(wallet !== undefined ? { wallet } : {}),
})

const scorpion = (team: number): UnitObject => ({
	type: SCORPION_TANK_TYPE,
	state: 0,
	team,
	health: unitData[SCORPION_TANK_TYPE].health,
})

// A full-ish MapObject the CPU planner can walk (movement/attack pathing, fog).
const makeMap = (): MapObject =>
	({
		cols: 6,
		rows: 6,
		fog: false,
		layers: {
			ground: new Array(36).fill(0).map(() => ({ type: PLAINS, state: 0 })),
			sky: new Array(36).fill(null),
			units: new Array(36).fill(null),
			buildings: new Array(36).fill(null),
		},
		highlights: new Array(36),
		route: [],
		pathHistory: [],
	}) as unknown as MapObject

const giveControls = (team: number) => {
	gameState.update((s) => ({
		...s,
		players: s.players.map((p) =>
			p.team === team ? { ...p, controls: { ground: true, air: false, sea: false } } : p
		),
	}))
}

describe('wallet helper', () => {
	it('a fresh Warmachine defaults to the full starting wallet; non-builders have none', () => {
		expect(isWalletUnit(warmachine(0))).toBe(true)
		expect(walletOf(warmachine(0))).toBe(WARMACHINE_WALLET)
		expect(isWalletUnit(scorpion(0))).toBe(false)
		expect(walletOf(scorpion(0))).toBe(0)
	})

	it('a stored balance is read back verbatim', () => {
		expect(walletOf(warmachine(0, 750))).toBe(750)
		expect(walletOf(warmachine(0, 0))).toBe(0)
	})
})

describe('mining refills the wallet, not the player pool', () => {
	beforeEach(() => resetGameState())

	it('credits the mining unit and leaves player money at zero', () => {
		const map = makeMap()
		map.layers.ground[7].type = ENRICHED_ORE
		map.layers.units[7] = warmachine(0)
		initGameStateFromMap(map)

		mine(map, 7, 0)
		expect(walletOf(map.layers.units[7]!)).toBe(WARMACHINE_WALLET + 500)
		expect(get(gameState).players.find((p) => p.team === 0)?.money).toBe(0)
	})
})

describe('applyAction build-adjacent', () => {
	beforeEach(() => resetGameState())

	it('spawns the unit and drains the builder wallet (player pool untouched)', () => {
		const map = makeMap()
		map.layers.units[7] = warmachine(0)
		map.layers.units[35] = warmachine(1) // second team so the roster exists
		initGameStateFromMap(map)

		applyAction(map, { kind: 'build-adjacent', builder: 7, unitType: SCORPION_TANK_TYPE })

		const spawned = [1, 6, 8, 13].map((t) => map.layers.units[t]).find((u) => u != null)
		expect(spawned?.type).toBe(SCORPION_TANK_TYPE)
		expect(walletOf(map.layers.units[7]!)).toBe(WARMACHINE_WALLET - unitData[SCORPION_TANK_TYPE].cost)
		expect(get(gameState).players.find((p) => p.team === 0)?.money).toBe(0)
	})
})

describe('CPU builder scoring', () => {
	it('mine reward scales up as the wallet empties', () => {
		expect(scoreBuilderMine(WARMACHINE_WALLET)).toBe(60)
		expect(scoreBuilderMine(LOW_WALLET)).toBe(60)
		expect(scoreBuilderMine(0)).toBe(200)
		expect(scoreBuilderMine(LOW_WALLET / 2)).toBeCloseTo(130)
	})

	it('build value folds the chosen unit score with the tile safety', () => {
		expect(scoreBuilderBuild(100, 20)).toBe(80)
	})

	it('attacking is full-value only on a clean, safe kill with few enemies; otherwise damped', () => {
		const kill: AttackScore = { damage: 99, score: 200, killsTarget: true, returnDamage: 0 }
		const chip: AttackScore = { damage: 10, score: 200, killsTarget: false, returnDamage: 0 }
		const risky: AttackScore = { damage: 99, score: 200, killsTarget: true, returnDamage: 30 }

		// Few enemies + clean, no-counter kill → take the shot at full tactical value.
		expect(scoreBuilderAttack(kill, FEW_ENEMIES, 10)).toBe(205)
		// Crowded board → last resort even for a clean kill.
		expect(scoreBuilderAttack(kill, FEW_ENEMIES + 1, 10)).toBeCloseTo(40)
		// Doesn't kill, or takes a counter → last resort.
		expect(scoreBuilderAttack(chip, 1, 10)).toBeCloseTo(40)
		expect(scoreBuilderAttack(risky, 1, 10)).toBeCloseTo(40)
	})

	it('positioning flees tiles an enemy can hit', () => {
		const map = makeMap()
		const wm = warmachine(0)
		map.layers.units[14] = wm
		map.layers.units[16] = scorpion(1) // an enemy two tiles east, in firing arc
		// A tile adjacent to the enemy is more dangerous than one far from it.
		const exposed = scoreBuilderPosition(map, 15, wm, 0, WARMACHINE_WALLET)
		const safe = scoreBuilderPosition(map, 0, wm, 0, WARMACHINE_WALLET)
		expect(safe).toBeGreaterThan(exposed)
	})
})

describe('CPU plans for a Warmachine', () => {
	beforeEach(() => resetGameState())

	it('builds (not a chip attack) with a healthy wallet and a buildable army', () => {
		const map = makeMap()
		map.layers.units[14] = warmachine(0)
		map.layers.units[35] = scorpion(1) // distant enemy, out of firing range
		initGameStateFromMap(map)
		giveControls(0)

		const best = bestPlanFor(map, 14, map.layers.units[14]!, 0)
		expect(best?.kind).toBe('build')
		// And the chosen deploy unit is one it can actually place on land — the build
		// action is well-formed, not skipped because the top pick was a sea unit.
		expect(best?.actions.some((a) => a.kind === 'build-adjacent')).toBe(true)
	})

	it('a near-empty wallet drives it to mine adjacent ore instead of building', () => {
		const map = makeMap()
		map.layers.ground[15].type = ENRICHED_ORE
		map.layers.units[14] = warmachine(0, 50) // can't afford anything
		map.layers.units[35] = warmachine(1)
		initGameStateFromMap(map)
		giveControls(0)

		const best = bestPlanFor(map, 14, map.layers.units[14]!, 0)
		expect(best?.kind).toBe('mine')
	})

	it('will consider an attack when a target is in firing range (situational, not forbidden)', () => {
		const map = makeMap()
		map.layers.units[14] = warmachine(0)
		// A direct-range-2 enemy two tiles east (same row): tiles 14→16.
		map.layers.units[16] = scorpion(1)
		initGameStateFromMap(map)
		giveControls(0)

		const plans = generatePlansFor(map, 14, map.layers.units[14]!, 0)
		expect(plans.some((p) => p.kind === 'attack')).toBe(true)
	})
})
