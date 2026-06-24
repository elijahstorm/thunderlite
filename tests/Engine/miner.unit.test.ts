// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { gameState, resetGameState, initGameStateFromMap } from '../../src/lib/Engine/gameState'
import { mine, canMineAt, MINE_REWARD } from '../../src/lib/Engine/modifiers/miner'
import { WARMACHINE_WALLET, walletOf } from '../../src/lib/Engine/wallet'
import { unitData } from '../../src/lib/GameData/unit'
import { terrainData } from '../../src/lib/GameData/terrain'

const WARMACHINE_TYPE = unitData.findIndex((u) => u.name === 'Warmachine')
const PLAINS = terrainData.findIndex((t) => t.name === 'Plains')
const ENRICHED_ORE = terrainData.findIndex((t) => t.name === 'Enriched Ore Deposit')
const ORE_DEPOSIT = terrainData.findIndex((t) => t.name === 'Ore Deposit')
const DEPLETED_ORE = terrainData.findIndex((t) => t.name === 'Depleted Ore Deposit')

const makeMap = (groundType = PLAINS, overrides: Partial<MapProcesser> = {}): MapProcesser => ({
	cols: 4,
	rows: 4,
	layers: {
		ground: new Array(16).fill(0).map(() => ({ type: groundType, state: 0 })),
		sky: new Array(16).fill(null),
		units: new Array(16).fill(null),
		buildings: new Array(16).fill(null),
	},
	...overrides,
})

const warmachine = (team: number): UnitObject => ({
	type: WARMACHINE_TYPE,
	state: 0,
	team,
	health: unitData[WARMACHINE_TYPE].health,
})

const moneyOf = (team: number) => get(gameState).players.find((p) => p.team === team)?.money ?? 0
const walletAt = (map: MapProcesser, tile: number) => {
	const unit = map.layers.units[tile]
	return unit ? walletOf(unit) : 0
}

describe('miner.canMineAt', () => {
	it('is mineable on Enriched and Ore tiers; a Depleted deposit is spent', () => {
		const map = makeMap()
		map.layers.ground[0].type = ENRICHED_ORE
		map.layers.ground[1].type = ORE_DEPOSIT
		map.layers.ground[2].type = DEPLETED_ORE
		map.layers.ground[3].type = PLAINS
		expect(canMineAt(map, 0)).toBe(true)
		expect(canMineAt(map, 1)).toBe(true)
		expect(canMineAt(map, 2)).toBe(false) // Depleted is terminal — no funds left
		expect(canMineAt(map, 3)).toBe(false)
	})
})

describe('miner.mine', () => {
	beforeEach(() => {
		resetGameState()
	})

	it('Enriched Ore Deposit → Ore Deposit, +500 to the unit wallet (not player money), tile acted', () => {
		const map = makeMap()
		map.layers.ground[5].type = ENRICHED_ORE
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)

		const result = mine(map, 5, 0)
		expect(result.ok).toBe(true)
		// The reward refills the Warmachine's own wallet; the player pool is untouched.
		expect(walletAt(map, 5)).toBe(WARMACHINE_WALLET + MINE_REWARD)
		expect(moneyOf(0)).toBe(0)
		expect(map.layers.ground[5].type).toBe(ORE_DEPOSIT)
		expect(get(gameState).actedTiles.has(5)).toBe(true)
	})

	it('Ore Deposit → Depleted Ore Deposit', () => {
		const map = makeMap()
		map.layers.ground[5].type = ORE_DEPOSIT
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)

		const result = mine(map, 5, 0)
		expect(result.ok).toBe(true)
		expect(map.layers.ground[5].type).toBe(DEPLETED_ORE)
		expect(walletAt(map, 5)).toBe(WARMACHINE_WALLET + MINE_REWARD)
		expect(moneyOf(0)).toBe(0)
	})

	it('refuses to mine a Depleted Ore Deposit — it is spent, no reward, tile unchanged', () => {
		const map = makeMap()
		map.layers.ground[5].type = DEPLETED_ORE
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)

		const result = mine(map, 5, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('not-mineable')
		expect(map.layers.ground[5].type).toBe(DEPLETED_ORE)
		expect(walletAt(map, 5)).toBe(WARMACHINE_WALLET)
		expect(get(gameState).actedTiles.has(5)).toBe(false)
	})

	it('refuses to mine on non-ore terrain', () => {
		const map = makeMap()
		map.layers.units[5] = warmachine(0)
		initGameStateFromMap(map)

		const result = mine(map, 5, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('not-mineable')
		expect(moneyOf(0)).toBe(0)
		expect(get(gameState).actedTiles.has(5)).toBe(false)
	})

	it('refuses to mine when no unit is on the tile', () => {
		const map = makeMap()
		map.layers.ground[5].type = ORE_DEPOSIT
		// roster needs a player but the mined tile is empty
		map.layers.units[0] = warmachine(0)
		initGameStateFromMap(map)

		const result = mine(map, 5, 0)
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toBe('no-unit')
	})
})
