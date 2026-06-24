import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { gameState } from '../gameState'
import { buildableUnits, type BuildableUnitsOptions } from '../build'
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

/**
 * Rank every unit the CPU can afford from a funding source, best first. Shared by
 * factory production (player money, gated by owned factories) and the Warmachine
 * builder (its own wallet, any unit type). `opts` is threaded straight into
 * {@link buildableUnits} to set the budget and lift the control gate. The
 * Warmachine planner walks the ranked list to skip choices it can't physically
 * deploy on the terrain around it (e.g. a sea unit on a landlocked tile).
 */
export const rankBuildableTypes = (
	map: MapObject,
	cpuTeam: number,
	opts: BuildableUnitsOptions = {}
): { type: number; score: number }[] => {
	const state = get(gameState)
	const player = state.players.find((p) => p.team === cpuTeam)
	if (!player) return []

	const mix = sampleArmyMix(map, cpuTeam)
	const enemyAirThreat = mix.air > 0 && mix.air * 3 >= mix.totalEnemies

	let ownCaptureCount = 0
	for (const u of map.layers.units) {
		if (u && u.team === cpuTeam && isCaptureCapable(u.type)) ownCaptureCount++
	}

	return buildableUnits(player, opts)
		.filter((c) => c.buildable)
		.map((c) => ({ type: c.type, score: scoreBuildChoice(c.type, mix, ownCaptureCount, enemyAirThreat) }))
		.sort((a, b) => b.score - a.score)
}

/**
 * The single highest-value unit the CPU should build, or null if it can afford
 * none. Thin wrapper over {@link rankBuildableTypes} for the factory path.
 */
export const bestBuildableType = (
	map: MapObject,
	cpuTeam: number,
	opts: BuildableUnitsOptions = {}
): { type: number; score: number } | null => rankBuildableTypes(map, cpuTeam, opts)[0] ?? null

export const pickBuildOnce = (map: MapObject, cpuTeam: number): SerializedAction | null => {
	const producers = findProducerBuildings(map, cpuTeam)
	if (producers.length === 0) return null

	const state = get(gameState)
	const player = state.players.find((p) => p.team === cpuTeam)
	if (!player) return null
	if (player.money <= 0) return null

	const best = bestBuildableType(map, cpuTeam)
	if (!best) return null

	return { kind: 'build', building: producers[0], unitType: best.type }
}
