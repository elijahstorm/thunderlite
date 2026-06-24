import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'
import { deriveFromData } from '$lib/Map/Editor/mapExporter'
import { previewDamage, canCounterAttack } from '$lib/Engine/combat'
import { tileHeightTier } from '$lib/Engine/modifiers/height'

// Headless combat resolution for the Combat Lab dev page. Everything routes
// through the same deriveFromData → previewDamage / canCounterAttack path the
// live engine uses, so the numbers here are the numbers a real match produces.

export const terrainIndex = (name: string): number => {
	const idx = terrainData.findIndex((t) => t.name === name)
	if (idx < 0) throw new Error(`combat sim: unknown terrain "${name}"`)
	return idx
}

// Land terrains worth pitting combat against — skips ocean tiles most units
// can't stand on. Order roughly by protection so the matrix reads as a ramp.
export const COMBAT_TERRAINS = [
	'Plains',
	'Road',
	'Wasteland',
	'Forest',
	'Hills',
	'Mountain',
	'Canyon',
].filter((name) => terrainData.some((t) => t.name === name))

const maxHealth = (type: number): number => unitData[type]?.health ?? 0

/** A 2-tile map: attacker on tile 0, defender on tile 1, adjacent. */
const buildDuelMap = (
	attackerType: number,
	defenderType: number,
	attackerTerrain: number,
	defenderTerrain: number
): MapObject =>
	deriveFromData({
		title: 'duel',
		cols: 2,
		rows: 1,
		fog: false,
		funds: 0,
		layers: {
			ground: [{ type: attackerTerrain }, { type: defenderTerrain }],
			sky: [],
			units: [
				{ type: attackerType, team: 0, l: 0 },
				{ type: defenderType, team: 1, l: 1 },
			],
			buildings: [],
		},
	} as unknown as MapData)

export type DuelInput = {
	attackerType: number
	defenderType: number
	attackerTerrain: number
	defenderTerrain: number
	/** 0..1 — attacker's current health fraction. */
	attackerHp: number
	/** 0..1 — defender's current health fraction. */
	defenderHp: number
}

export type DuelResult = {
	attackerMax: number
	defenderMax: number
	attackerHealth: number
	defenderHealth: number
	/** Damage the attacker deals on the opening strike. */
	damage: number
	defenderHealthAfter: number
	/** True if the (surviving) defender can fire back. */
	canCounter: boolean
	counterDamage: number
	attackerHealthAfter: number
	/** Read-straight-from-data factors, for the breakdown panel. */
	factors: {
		matchup: number
		defenderProtection: number
		heightTierAdvantage: number
	}
}

export const resolveDuel = (input: DuelInput): DuelResult => {
	const { attackerType, defenderType, attackerTerrain, defenderTerrain } = input
	const map = buildDuelMap(attackerType, defenderType, attackerTerrain, defenderTerrain)

	const attackerMax = maxHealth(attackerType)
	const defenderMax = maxHealth(defenderType)
	const attackerHealth = Math.max(0, Math.round(attackerMax * input.attackerHp))
	const defenderHealth = Math.max(0, Math.round(defenderMax * input.defenderHp))

	const attacker = map.layers.units[0]!
	const defender = map.layers.units[1]!
	attacker.health = attackerHealth
	defender.health = defenderHealth

	const damage = previewDamage(attacker, defender, {
		map,
		defenderTile: 1,
		attackerTile: 0,
		role: 'attack',
	})
	const defenderHealthAfter = Math.max(0, defenderHealth - damage)

	const survivor: UnitObject = { ...defender, health: defenderHealthAfter }
	const canCounter =
		defenderHealthAfter > 0 &&
		canCounterAttack(attacker, survivor, { map, attackerTile: 0, defenderTile: 1 })
	const counterDamage = canCounter
		? previewDamage(survivor, attacker, {
				map,
				defenderTile: 0,
				attackerTile: 1,
				role: 'counter',
			})
		: 0
	const attackerHealthAfter = Math.max(0, attackerHealth - counterDamage)

	const atkStats = unitData[attackerType]
	const defStats = unitData[defenderType]
	const matchup = atkStats && defStats && atkStats.weaponType === defStats.armorType ? 1.5 : 1

	return {
		attackerMax,
		defenderMax,
		attackerHealth,
		defenderHealth,
		damage,
		defenderHealthAfter,
		canCounter,
		counterDamage,
		attackerHealthAfter,
		factors: {
			matchup,
			defenderProtection: terrainData[defenderTerrain]?.protection ?? 0,
			heightTierAdvantage: tileHeightTier(map, 0) - tileHeightTier(map, 1),
		},
	}
}

/** Damage of every attacker (rows) vs every defender (cols) at full HP on one
 * shared terrain. Used by the matrix view. */
export const damageMatrix = (terrain: number): number[][] =>
	unitData.map((_atk, a) =>
		unitData.map((_def, d) => {
			const map = buildDuelMap(a, d, terrain, terrain)
			const attacker = map.layers.units[0]!
			const defender = map.layers.units[1]!
			attacker.health = maxHealth(a)
			defender.health = maxHealth(d)
			return previewDamage(attacker, defender, {
				map,
				defenderTile: 1,
				attackerTile: 0,
				role: 'attack',
			})
		})
	)
