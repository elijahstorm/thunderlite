import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { terrainData } from '$lib/GameData/terrain'
import { previewDamage } from '../combat'
import { generateAttackList } from '../Interactor/Pathing/attack'
import { concealedEnemyTiles } from '../visibility'

export const unitValue = (unit: UnitObject): number => {
	const data = unitData[unit.type]
	if (!data) return 0
	const max = data.health || 1
	const hp = unit.health ?? max
	const cost = data.cost > 0 ? data.cost : 50
	return cost * (hp / max)
}

export const terrainProtection = (map: MapObject, tile: number): number => {
	const ground = map.layers.ground[tile]
	if (!ground) return 0
	return terrainData[ground.type]?.protection ?? 0
}

export const buildingValue = (map: MapObject, tile: number, cpuTeam: number): number => {
	const building = map.layers.buildings[tile]
	if (!building) return 0
	const data = buildingData[building.type]
	if (!data) return 0
	if (building.team === cpuTeam) return 0

	let v = 0
	if (data.modifiers.includes('Capture.Insta_Lose')) v += 4000
	if (data.modifiers.includes('Capture.Allow_Ground')) v += 600
	if (data.modifiers.includes('Capture.Allow_Air')) v += 700
	if (data.modifiers.includes('Capture.Allow_Sea')) v += 700
	if (data.actable) v += 500
	v += data.income * 2

	if (building.team === -1 || building.team === undefined || !isOwnedByLivingTeam(building)) {
		v *= 0.85
	}
	return v
}

const isOwnedByLivingTeam = (building: BuildingObject): boolean => {
	return typeof building.team === 'number' && building.team >= 0
}

// `concealed` (tiles holding enemies the CPU can't perceive) is excluded from the
// threat sum: the AI plays blind, so a stealthed/fogged enemy contributes no fear.
// Defaults to recomputing it; the planner passes a shared set to avoid recomputing
// per candidate tile.
export const threatToTile = (
	map: MapObject,
	tile: number,
	defender: UnitObject,
	cpuTeam: number,
	concealed: ReadonlySet<number> = concealedEnemyTiles(map, cpuTeam)
): number => {
	let totalIncomingHP = 0
	const units = map.layers.units
	for (let i = 0; i < units.length; i++) {
		const enemy = units[i]
		if (!enemy || enemy.team === cpuTeam) continue
		if (concealed.has(i)) continue
		const reach = generateAttackList(map, i, enemy)
		if (!reach.includes(tile)) continue
		const dmg = previewDamage(enemy, defender, {
			map,
			defenderTile: tile,
			attackerTile: i,
			role: 'attack',
		})
		totalIncomingHP += dmg
	}
	return totalIncomingHP
}

export const enemyCount = (map: MapObject, cpuTeam: number): number => {
	let n = 0
	for (const u of map.layers.units) {
		if (u && u.team !== cpuTeam) n++
	}
	return n
}

export const teamUnits = (map: MapObject, team: number): { tile: number; unit: UnitObject }[] => {
	const out: { tile: number; unit: UnitObject }[] = []
	const units = map.layers.units
	for (let i = 0; i < units.length; i++) {
		const u = units[i]
		if (u && u.team === team) out.push({ tile: i, unit: u })
	}
	return out
}

// Concealed enemies are skipped — the CPU steers toward foes it can actually see,
// not ones cloaked by fog/stealth (whose positions it shouldn't know).
export const closestEnemyDistance = (
	map: MapObject,
	tile: number,
	cpuTeam: number,
	concealed: ReadonlySet<number> = concealedEnemyTiles(map, cpuTeam)
): number => {
	const col = tile % map.cols
	const row = Math.floor(tile / map.cols)
	let best = Infinity
	const units = map.layers.units
	for (let i = 0; i < units.length; i++) {
		const u = units[i]
		if (!u || u.team === cpuTeam) continue
		if (concealed.has(i)) continue
		const ec = i % map.cols
		const er = Math.floor(i / map.cols)
		const d = Math.abs(col - ec) + Math.abs(row - er)
		if (d < best) best = d
	}
	return best === Infinity ? 0 : best
}

export const closestObjectiveDistance = (map: MapObject, tile: number, cpuTeam: number): number => {
	const col = tile % map.cols
	const row = Math.floor(tile / map.cols)
	let best = Infinity
	const buildings = map.layers.buildings
	for (let i = 0; i < buildings.length; i++) {
		const b = buildings[i]
		if (!b) continue
		const data = buildingData[b.type]
		if (!data || data.stature <= 0) continue
		if (b.team === cpuTeam) continue
		const bc = i % map.cols
		const br = Math.floor(i / map.cols)
		const d = Math.abs(col - bc) + Math.abs(row - br)
		if (d < best) best = d
	}
	return best === Infinity ? 0 : best
}
