import { get } from 'svelte/store'
import { terrainData } from '$lib/GameData/terrain'
import { gameState, markTileActed } from '$lib/Engine/gameState'
import { walletOf } from '$lib/Engine/wallet'

const terrainTypeByName = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`miner: missing terrain "${name}"`)
	return idx
}

const ENRICHED_ORE = terrainTypeByName('Enriched Ore Deposit')
const ORE_DEPOSIT = terrainTypeByName('Ore Deposit')
const DEPLETED_ORE = terrainTypeByName('Depleted Ore Deposit')

export const MINE_REWARD = 500

// A deposit yields $500 per harvest down two tiers — Enriched → Ore → Depleted —
// for $1000 total. A Depleted Ore Deposit is spent: it has no transition here, so
// `isMineableTerrainType` reports it un-mineable and it stays on the map as a
// visibly-exhausted tile rather than reverting to plains.
const mineTransitions: Record<number, number> = {
	[ENRICHED_ORE]: ORE_DEPOSIT,
	[ORE_DEPOSIT]: DEPLETED_ORE,
}

export const isMineableTerrainType = (terrainType: number): boolean =>
	Object.prototype.hasOwnProperty.call(mineTransitions, terrainType)

export const canMineAt = (map: MapObject | MapProcesser, tile: number): boolean => {
	const ground = map.layers.ground[tile]
	if (!ground) return false
	return isMineableTerrainType(ground.type)
}

export type MineResult =
	| { ok: true; reward: number; nextTerrain: number }
	| { ok: false; reason: 'not-mineable' | 'no-unit' | 'wrong-team' | 'invalid-player' }

export const mine = (map: MapObject | MapProcesser, tile: number, team: number): MineResult => {
	const unit = map.layers.units[tile]
	if (!unit) return { ok: false, reason: 'no-unit' }
	if (unit.team !== team) return { ok: false, reason: 'wrong-team' }

	const ground = map.layers.ground[tile]
	if (!ground || !isMineableTerrainType(ground.type)) {
		return { ok: false, reason: 'not-mineable' }
	}

	const state = get(gameState)
	if (!state.players.find((p) => p.team === team)) {
		return { ok: false, reason: 'invalid-player' }
	}

	const nextTerrain = mineTransitions[ground.type]
	ground.type = nextTerrain
	ground.state = 0

	// The reward refills the mining unit's own wallet, not the player pool — a
	// Warmachine harvests ore to fund the units it builds (see Engine/wallet.ts).
	unit.wallet = walletOf(unit) + MINE_REWARD

	markTileActed(tile)

	return { ok: true, reward: MINE_REWARD, nextTerrain }
}
