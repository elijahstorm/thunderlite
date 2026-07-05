import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { gameState } from '../gameState'
import { buildableUnits, canDeployFromFactory, type BuildableUnitsOptions } from '../build'
import { previewDamage } from '../combat'
import { unitTypeHasRadar, hasRadarField } from '../visibility'
import { lurkingStealthCount } from './stealthMemory'
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

type StealthHunt = {
	// Enemy cloak units the CPU remembers but can't see right now.
	lurking: number
	// Jammer Trucks the CPU already fields — don't keep churning them out.
	ownRadar: number
}

// How well a freshly-built `unitType` matches up against the enemy army the CPU can
// currently see. Runs the real combat math (weapon/armor matchup, Flak vs light armor,
// etc.) against each enemy on its own tile — no lookahead, just "would this actually
// hurt what they field, and survive what they bring back". Returns ~0 when there's
// nothing to counter. This is what makes the CPU *react to what the player builds*:
// flood it with light armor and it shifts toward Flak instead of churning the same
// brick every turn. `defenderTile` doubles as a terrain proxy for the incoming hit —
// rough, but enough to bias production sensibly.
const counterEffectiveness = (
	map: MapObject,
	unitType: number,
	cpuTeam: number,
	enemies: { tile: number; unit: UnitObject }[]
): number => {
	const data = unitData[unitType]
	if (!data || enemies.length === 0) return 0
	const fresh: UnitObject = { type: unitType, team: cpuTeam, health: data.health, state: 0 }
	const freshMax = data.health || 1
	let offense = 0
	let defense = 0
	for (const { tile, unit } of enemies) {
		const ed = unitData[unit.type]
		if (!ed) continue
		const eMax = ed.health || 1
		const eHp = unit.health ?? eMax
		const out = previewDamage(fresh, unit, { map, defenderTile: tile, role: 'attack' })
		offense += Math.min(out, eHp) / eMax
		const inc = previewDamage(unit, fresh, { map, defenderTile: tile, role: 'attack' })
		defense += Math.min(inc, freshMax) / freshMax
	}
	const n = enemies.length
	return (offense / n) * 120 - (defense / n) * 40
}

const scoreBuildChoice = (
	unitType: number,
	// Effective price from the funding source (control discounts applied), so a
	// discounted category correctly looks cheaper to the planner.
	effectiveCost: number,
	mix: ArmyMix,
	ownCaptureCount: number,
	enemyAirThreat: boolean,
	hunt: StealthHunt,
	counter: number
): number => {
	const data = unitData[unitType]
	if (!data) return -Infinity
	const cost = effectiveCost > 0 ? effectiveCost : 1

	let score = 100 + (data.power + data.health) * 0.4

	// Reward building a real counter to what the enemy currently fields.
	score += counter

	if (enemyAirThreat && isAntiAir(unitType)) score += 250
	if (ownCaptureCount < 2 && isCaptureCapable(unitType)) score += 200
	if (data.movement >= 4) score += 30

	// Cloak hunters: when the CPU believes ambushers lurk, it wants eyes. A first
	// Jammer Truck (mobile radar that flushes them and screens our line) is a high
	// priority; further ones taper off. Failing that, a cheap fast scout to probe.
	if (hunt.lurking > 0) {
		if (unitTypeHasRadar(unitType)) {
			// One mobile radar is plenty to sweep a hunch — don't stockpile jammers.
			score += hunt.ownRadar === 0 ? 220 : 0
		} else if (data.movement >= 5 && cost <= 300 && data.sight > 0) {
			score += 60
		}
	}

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
	let ownRadar = 0
	for (const u of map.layers.units) {
		if (!u || u.team !== cpuTeam) continue
		if (isCaptureCapable(u.type)) ownCaptureCount++
		if (hasRadarField(u)) ownRadar++
	}
	const hunt: StealthHunt = { lurking: lurkingStealthCount(map, cpuTeam), ownRadar }

	// Visible enemy army, used to score how well each buildable type counters it.
	const enemies: { tile: number; unit: UnitObject }[] = []
	for (let i = 0; i < map.layers.units.length; i++) {
		const u = map.layers.units[i]
		if (u && u.team !== cpuTeam) enemies.push({ tile: i, unit: u })
	}

	return buildableUnits(player, opts)
		.filter((c) => c.buildable)
		.map((c) => ({
			type: c.type,
			score: scoreBuildChoice(
				c.type,
				c.cost,
				mix,
				ownCaptureCount,
				enemyAirThreat,
				hunt,
				counterEffectiveness(map, c.type, cpuTeam, enemies)
			),
		}))
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

	// A factory deploys onto its own tile, so a ship can only come from a coastal
	// (Shore) factory. Walk the ranked wish-list and pick the best type that some
	// idle producer can physically launch — skipping, say, a top-ranked warship
	// when every free factory is landlocked, rather than emitting a build that
	// no-ops on apply.
	for (const { type } of rankBuildableTypes(map, cpuTeam)) {
		const producer = producers.find((p) => canDeployFromFactory(map, p, type))
		if (producer !== undefined) return { kind: 'build', building: producer, unitType: type }
	}
	return null
}
