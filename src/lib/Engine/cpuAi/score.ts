import { unitData } from '$lib/GameData/unit'
import { previewDamage, canCounterAttack } from '../combat'
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

export const scorePositionBonus = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number
): number => {
	const cover = terrainProtection(map, tile) * unitValue(unit) * 0.05
	const threat = threatToTile(map, tile, unit, cpuTeam) * VALUE_PER_HP * unitValue(unit) * 0.5
	const objectiveDist = closestObjectiveDistance(map, tile, cpuTeam)
	const enemyDist = closestEnemyDistance(map, tile, cpuTeam)
	const advance = objectiveDist > 0 ? -objectiveDist * 1.5 : -enemyDist * 0.5
	return cover - threat + advance
}

export const scoreWait = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	cpuTeam: number
): number => {
	return scorePositionBonus(map, tile, unit, cpuTeam) - 5
}
