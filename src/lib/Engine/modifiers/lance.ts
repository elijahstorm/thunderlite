import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { calculateDamage } from '../combat'
import { gameState } from '../gameState'
import { hasModifier } from './canAttack'
import { runModifiers } from './index'

export type LancePassthroughResult = {
	tile: number
	target: UnitObject
	damage: number
	killed: boolean
}

export const computeBehindTile = (
	map: Pick<MapObject, 'cols' | 'rows'>,
	attackerTile: number,
	targetTile: number
): number | null => {
	const ax = attackerTile % map.cols
	const ay = Math.floor(attackerTile / map.cols)
	const tx = targetTile % map.cols
	const ty = Math.floor(targetTile / map.cols)
	const bx = tx + (tx - ax)
	const by = ty + (ty - ay)
	if (bx < 0 || bx >= map.cols || by < 0 || by >= map.rows) return null
	return by * map.cols + bx
}

export const applyLancePassthrough = (
	map: MapObject,
	attackerTile: number,
	targetTile: number
): LancePassthroughResult | null => {
	const attacker = map.layers.units[attackerTile]
	if (!attacker || !hasModifier(attacker, 'Attack.Lance')) return null

	const behind = computeBehindTile(map, attackerTile, targetTile)
	if (behind === null) return null

	const passthrough = map.layers.units[behind]
	if (!passthrough) return null

	const damage = calculateDamage(attacker, passthrough, {
		map,
		defenderTile: behind,
		role: 'attack',
	})
	const maxHealth = unitData[passthrough.type].health
	passthrough.health = Math.max((passthrough.health ?? maxHealth) - damage, 0)

	const killed = passthrough.health === 0
	if (killed) {
		map.layers.units[behind] = null
		runModifiers(passthrough, 'Death', {
			kind: 'unit',
			tile: behind,
			state: get(gameState),
			map,
		})
	}

	return { tile: behind, target: passthrough, damage, killed }
}
