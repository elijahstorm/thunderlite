import { unitData } from '$lib/GameData/unit'
import { terrainData } from '$lib/GameData/terrain'
import { validTerrain, drag } from '$lib/Engine/Interactor/Pathing/movement'
import { hasModifier } from './canAttack'

const findUnitType = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`transport: missing unit "${name}"`)
	return idx
}

export const TRANSPORTER_TYPE = findUnitType('Transporter')
export const LEVIATHAN_TYPE = findUnitType('Leviathan')

const adjacencyOffsets = (cols: number) => [-cols, -1, 1, cols]

const adjacentTiles = (map: MapObject | MapProcesser, tile: number): number[] => {
	const col = tile % map.cols
	const row = Math.floor(tile / map.cols)
	const out: number[] = []
	for (const offset of adjacencyOffsets(map.cols)) {
		const next = tile + offset
		if (next < 0 || next >= map.cols * map.rows) continue
		const nextCol = next % map.cols
		const nextRow = Math.floor(next / map.cols)
		if (Math.abs(nextCol - col) + Math.abs(nextRow - row) !== 1) continue
		out.push(next)
	}
	return out
}

export const findFriendlyTransporters = (
	map: MapObject | MapProcesser,
	commandoTile: number,
	team: number
): number[] =>
	adjacentTiles(map, commandoTile).filter((t) => {
		const occupant = map.layers.units[t]
		if (!occupant) return false
		if (occupant.team !== team) return false
		if (occupant.type !== TRANSPORTER_TYPE) return false
		if (occupant.rescuedUnit) return false
		return true
	})

export type TransportLoadResult =
	| { ok: true; transportTile: number }
	| { ok: false; reason: 'no-commando' | 'no-transport' | 'cannot-transport' | 'occupied' }

const carryHPRatio = (carrier: UnitObject, passengerMaxHP: number, passengerHP: number): number => {
	const carrierMax = unitData[carrier.type].health
	const ratio = passengerHP / passengerMaxHP
	return Math.max(1, Math.round(carrierMax * ratio))
}

const restoreHPRatio = (passenger: UnitObject, carrier: UnitObject): number => {
	const passengerMax = unitData[passenger.type].health
	const carrierMax = unitData[carrier.type].health
	const carrierHP = carrier.health ?? carrierMax
	const ratio = carrierHP / carrierMax
	return Math.max(1, Math.round(passengerMax * ratio))
}

export const transportLoad = (
	map: MapObject | MapProcesser,
	commandoTile: number,
	transportTile: number
): TransportLoadResult => {
	const commando = map.layers.units[commandoTile]
	if (!commando) return { ok: false, reason: 'no-commando' }
	if (!hasModifier(commando, 'Self_Action.Transport')) {
		return { ok: false, reason: 'cannot-transport' }
	}

	const transport = map.layers.units[transportTile]
	if (!transport || transport.type !== TRANSPORTER_TYPE) {
		return { ok: false, reason: 'no-transport' }
	}
	if (transport.team !== commando.team) return { ok: false, reason: 'no-transport' }
	if (transport.rescuedUnit) return { ok: false, reason: 'occupied' }

	const commandoMax = unitData[commando.type].health
	const commandoHP = commando.health ?? commandoMax
	transport.health = carryHPRatio(transport, commandoMax, commandoHP)
	transport.rescuedUnit = commando

	map.layers.units[commandoTile] = null
	return { ok: true, transportTile }
}

export const canShipOut = (map: MapObject | MapProcesser, unitTile: number): boolean => {
	const unit = map.layers.units[unitTile]
	if (!unit) return false
	if (unitData[unit.type].type !== 'ground') return false
	const ground = map.layers.ground[unitTile]
	if (!ground) return false
	return terrainData[ground.type]?.name === 'Shore'
}

export type ShipOutResult =
	| { ok: true; transportTile: number }
	| { ok: false; reason: 'no-unit' | 'not-on-shore' | 'not-ground' }

export const shipOut = (
	map: MapObject | MapProcesser,
	unitTile: number
): ShipOutResult => {
	const unit = map.layers.units[unitTile]
	if (!unit) return { ok: false, reason: 'no-unit' }
	if (unitData[unit.type].type !== 'ground') return { ok: false, reason: 'not-ground' }
	if (!canShipOut(map, unitTile)) return { ok: false, reason: 'not-on-shore' }

	const transport: UnitObject = {
		type: LEVIATHAN_TYPE,
		state: 0,
		team: unit.team,
		health: unitData[LEVIATHAN_TYPE].health,
		rescuedUnit: unit,
	}
	const unitMax = unitData[unit.type].health
	const unitHP = unit.health ?? unitMax
	transport.health = carryHPRatio(transport, unitMax, unitHP)

	map.layers.units[unitTile] = transport
	return { ok: true, transportTile: unitTile }
}

export const hasRescuedUnit = (unit: UnitObject | null | undefined): boolean =>
	!!(unit && unit.rescuedUnit)

export const landTiles = (
	map: MapObject | MapProcesser,
	transportTile: number
): number[] => {
	const transport = map.layers.units[transportTile]
	if (!transport || !transport.rescuedUnit) return []
	const rescued = transport.rescuedUnit
	const mapWithSky = map as MapObject

	return adjacentTiles(map, transportTile).filter((t) => {
		if (map.layers.units[t] != null) return false
		const ground = map.layers.ground[t]
		if (!ground) return false
		if (!validTerrain(ground, rescued)) return false
		const sky = mapWithSky.layers.sky ? mapWithSky.layers.sky[t] : null
		const cost = drag(rescued, ground, sky ?? undefined)
		return cost < 100
	})
}

export type LandUnloadResult =
	| { ok: true; destination: number; unit: UnitObject }
	| { ok: false; reason: 'no-transport' | 'no-rescued' | 'invalid-destination' }

export const landUnload = (
	map: MapObject | MapProcesser,
	transportTile: number,
	destination: number
): LandUnloadResult => {
	const transport = map.layers.units[transportTile]
	if (!transport) return { ok: false, reason: 'no-transport' }
	const rescued = transport.rescuedUnit
	if (!rescued) return { ok: false, reason: 'no-rescued' }

	const valid = landTiles(map, transportTile)
	if (!valid.includes(destination)) return { ok: false, reason: 'invalid-destination' }

	rescued.health = restoreHPRatio(rescued, transport)
	transport.rescuedUnit = null
	map.layers.units[transportTile] = null
	map.layers.units[destination] = rescued

	return { ok: true, destination, unit: rescued }
}
