import { unitData } from '$lib/GameData/unit'
import { previewDamage, canCounterAttack } from '../combat'
import { isStealthUnit } from '../visibility'
import { hasAdjacentEnemy } from '../modifiers/cloak'
import {
	unitValue,
	terrainProtection,
	buildingValue,
	threatToTile,
	closestEnemyDistance,
	closestObjectiveDistance,
} from './evaluate'

const VALUE_PER_HP = 1 / 40

export type AttackScore = {
	damage: number
	score: number
	killsTarget: boolean
	returnDamage: number
}

export const scoreAttack = (
	map: MapObject,
	attacker: UnitObject,
	attackerTile: number,
	defender: UnitObject,
	defenderTile: number
): AttackScore => {
	const damage = previewDamage(attacker, defender, {
		map,
		defenderTile,
		attackerTile,
		role: 'attack',
	})

	const defStats = unitData[defender.type]
	const defMax = defStats?.health ?? 1
	const defCurrent = defender.health ?? defMax
	const killsTarget = damage >= defCurrent

	let returnDamage = 0
	if (!killsTarget) {
		const counterOk = canCounterAttack(attacker, defender, {
			map,
			attackerTile,
			defenderTile,
		})
		if (counterOk) {
			const simulated: UnitObject = {
				...defender,
				health: Math.max(0, defCurrent - damage),
			}
			returnDamage = previewDamage(simulated, attacker, {
				map,
				defenderTile: attackerTile,
				attackerTile: defenderTile,
				role: 'counter',
			})
		}
	}

	const tv = unitValue(defender)
	const av = unitValue(attacker)
	const damageValueOut = killsTarget ? tv : damage * VALUE_PER_HP * tv
	const damageValueIn = returnDamage * VALUE_PER_HP * av

	let score = damageValueOut - damageValueIn
	if (killsTarget) score += 25
	if (killsTarget && !defStats) score = 0

	return { damage, score, killsTarget, returnDamage }
}

export const scoreCapture = (map: MapObject, tile: number, cpuTeam: number): number => {
	return buildingValue(map, tile, cpuTeam) * 0.5
}

export const scoreMine = (): number => 35

export const scoreRepair = (unit: UnitObject): number => {
	const data = unitData[unit.type]
	if (!data) return 0
	const max = data.health || 1
	const hp = unit.health ?? max
	const ratio = hp / max
	if (ratio >= 0.8) return 0
	const cost = data.cost > 0 ? data.cost : 50
	return (1 - ratio) * cost * 0.15
}

// Stealth units earn their keep cloaked, as invisible area-denial: an enemy can't
// path through a tile it doesn't know is occupied, so a hidden Stealth Tank / sub
// silently walls a lane. Reward an owned stealth unit for holding a forward tile
// while staying hidden, and dock it for ending adjacent to an enemy (which flushes
// it out — an attack that wants that trade is scored separately via scoreAttack).
// `enemyDist` is the already-computed blind closest-enemy distance.
const scoreStealthPositioning = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	enemyDist: number
): number => {
	if (!isStealthUnit(unit)) return 0
	if (hasAdjacentEnemy(map, tile, cpuTeam)) return -unitValue(unit) * 0.05
	const forward = enemyDist > 0 ? Math.max(0, 8 - enemyDist) : 0
	return forward * 1.2
}

// `concealed` (enemies the CPU can't perceive) is threaded into the threat and
// closest-enemy terms so the AI scores positions blind to fogged/stealthed foes.
// `lurking` is the count of enemy stealth units the CPU *remembers but can't see*
// (see stealthMemory.ts) — it makes the AI hesitate to expose itself near the front
// where a remembered ambush could spring. Both default to no-op so the inspector and
// tests get the plain greedy score.
export const scorePositionBonus = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	concealed?: ReadonlySet<number>,
	lurking: number = 0
): number => {
	const cover = terrainProtection(map, tile) * unitValue(unit) * 0.05
	const threat =
		threatToTile(map, tile, unit, cpuTeam, concealed) * VALUE_PER_HP * unitValue(unit) * 0.5
	const objectiveDist = closestObjectiveDistance(map, tile, cpuTeam)
	const enemyDist = closestEnemyDistance(map, tile, cpuTeam, concealed)
	const advance = objectiveDist > 0 ? -objectiveDist * 1.5 : -enemyDist * 0.5
	const stealth = scoreStealthPositioning(map, tile, unit, cpuTeam, enemyDist)
	const caution = lurking * Math.max(0, 6 - enemyDist) * 0.4
	return cover - threat + advance + stealth - caution
}

export const scoreWait = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number,
	concealed?: ReadonlySet<number>,
	lurking: number = 0
): number => {
	return scorePositionBonus(map, tile, unit, cpuTeam, concealed, lurking) - 5
}
