import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { gameState } from '../gameState'
import { buildableUnits } from '../build'
import type { SerializedAction } from '../Interactor/serializedAction'

type ArmyMix = {
	ground: number
	air: number
	sea: number
	antiAirCount: number
	totalEnemies: number
}

const sampleArmyMix = (map: MapObject, cpuTeam: number): ArmyMix => {
	const mix: ArmyMix = { ground: 0, air: 0, sea: 0, antiAirCount: 0, totalEnemies: 0 }
	for (const u of map.layers.units) {
		if (!u || u.team === cpuTeam) continue
		const data = unitData[u.type]
		if (!data) continue
		mix.totalEnemies++
		mix[data.type]++
		if (data.modifiers.includes('Can_Attack.Air_Raid')) mix.antiAirCount++
	}
	return mix
}

const isAntiAir = (unitType: number): boolean => {
	const data = unitData[unitType]
	return !!data && data.modifiers.includes('Can_Attack.Air_Raid')
}

const isCaptureCapable = (unitType: number): boolean => {
	const data = unitData[unitType]
	return !!data && data.modifiers.includes('Start_Turn.Capture')
}

const findProducerBuildings = (map: MapObject, cpuTeam: number): number[] => {
	const out: number[] = []
	const acted = get(gameState).actedTiles
	for (let i = 0; i < map.layers.buildings.length; i++) {
		const b = map.layers.buildings[i]
		if (!b || b.team !== cpuTeam) continue
		const data = buildingData[b.type]
		if (!data || !data.actable) continue
		if (acted.has(i)) continue
		if (map.layers.units[i] != null) continue
		out.push(i)
	}
	return out
}

const scoreBuildChoice = (
	unitType: number,
	mix: ArmyMix,
	ownCaptureCount: number,
	enemyAirThreat: boolean
): number => {
	const data = unitData[unitType]
	if (!data) return -Infinity
	const cost = data.cost > 0 ? data.cost : 1

	let score = 100 + (data.power + data.health) * 0.4

	if (enemyAirThreat && isAntiAir(unitType)) score += 250
	if (ownCaptureCount < 2 && isCaptureCapable(unitType)) score += 200
	if (data.movement >= 4) score += 30

	return score - cost * 0.1
}

export const pickBuildOnce = (map: MapObject, cpuTeam: number): SerializedAction | null => {
	const producers = findProducerBuildings(map, cpuTeam)
	if (producers.length === 0) return null

	const state = get(gameState)
	const player = state.players.find((p) => p.team === cpuTeam)
	if (!player) return null
	if (player.money <= 0) return null

	const mix = sampleArmyMix(map, cpuTeam)
	const enemyAirThreat = mix.air > 0 && mix.air * 3 >= mix.totalEnemies

	let ownCaptureCount = 0
	for (const u of map.layers.units) {
		if (u && u.team === cpuTeam && isCaptureCapable(u.type)) ownCaptureCount++
	}

	const candidates = buildableUnits(player).filter((c) => c.buildable)
	if (candidates.length === 0) return null

	let bestType: number | null = null
	let bestScore = -Infinity
	for (const c of candidates) {
		const s = scoreBuildChoice(c.type, mix, ownCaptureCount, enemyAirThreat)
		if (s > bestScore) {
			bestScore = s
			bestType = c.type
		}
	}
	if (bestType === null) return null

	return { kind: 'build', building: producers[0], unitType: bestType }
}
