import { unitData } from '$lib/GameData/unit'
import { buildingData } from '$lib/GameData/building'
import { validTerrain, drag } from '$lib/Engine/Interactor/Pathing/movement'
import { hasModifier } from './canAttack'
import { resetCaptureProgress } from './capture'
import { tileHasModifier } from './terrainModifier'

const findUnitType = (name: string): number => {
	const idx = unitData.findIndex((u) => u.name === name)
	if (idx < 0) throw new Error(`transport: missing unit "${name}"`)
	return idx
}

export const TRANSPORTER_TYPE = findUnitType('Transporter')
export const LEVIATHAN_TYPE = findUnitType('Leviathan')

/** True for the unit types that carry a passenger (air paraglider / sea lander). */
export const isTransportType = (type: number): boolean =>
	type === TRANSPORTER_TYPE || type === LEVIATHAN_TYPE

// The unit types a given transport may legally carry, mirroring the gameplay
// rules so the editor can't author an illegal pairing:
//   Transporter (air paraglider) — units with the `Self_Action.Transport` grant
//       (exactly what `transportLoad` accepts: the commandos).
//   Leviathan (sea lander) — any ground unit (what `shipOut` embarks).
// Any non-transport returns an empty list.
export const carriableUnitTypes = (transportType: number): number[] => {
	if (transportType === TRANSPORTER_TYPE) {
		return unitData
			.map((_, i) => i)
			.filter((i) => unitData[i].modifiers.includes('Self_Action.Transport'))
	}
	if (transportType === LEVIATHAN_TYPE) {
		return unitData.map((_, i) => i).filter((i) => unitData[i].type === 'ground')
	}
	return []
}

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

	// Boarding vacates the tile — abandon any capture in progress there, same as a move.
	resetCaptureProgress(map.layers.buildings[commandoTile], commando.team)
	map.layers.units[commandoTile] = null
	return { ok: true, transportTile }
}

// A ground unit can embark — transforming itself into a Leviathan sea transport
// that carries it across the ocean (and can't attack) — only from a tile with the
// `Port` terrain attribute. Shore is the stock Port tile, but any terrain authored
// with the `Port` modifier now works the same way.
export const canShipOut = (map: MapObject | MapProcesser, unitTile: number): boolean => {
	const unit = map.layers.units[unitTile]
	if (!unit) return false
	if (unitData[unit.type].type !== 'ground') return false
	if (!map.layers.ground[unitTile]) return false
	return tileHasModifier(map, unitTile, 'Port')
}

export type ShipOutResult =
	| { ok: true; transportTile: number }
	| { ok: false; reason: 'no-unit' | 'not-on-shore' | 'not-ground' }

export const shipOut = (map: MapObject | MapProcesser, unitTile: number): ShipOutResult => {
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

// A team can paraglide its commandos into the air once it controls an Air Control
// building (the same `Capture.Allow_Air` grant that unlocks building air units).
export const teamHasAirControl = (map: MapObject | MapProcesser, team: number): boolean => {
	for (const building of map.layers.buildings) {
		if (!building || building.team !== team) continue
		if (buildingData[building.type]?.modifiers.includes('Capture.Allow_Air')) return true
	}
	return false
}

// A commando (anything carrying `Self_Action.Transport` — Strike/Heavy Commandos)
// can air-lift itself into a paraglider Transporter, mirroring `shipOut` but with
// no terrain requirement: it works from any tile so long as the owning team holds
// an Air Control. The carried unit can only disembark where it could stand, which
// `landTiles` already enforces, so a paraglider can't drop a ground unit onto sea.
export const canAirLift = (map: MapObject | MapProcesser, unitTile: number): boolean => {
	const unit = map.layers.units[unitTile]
	if (!unit) return false
	if (!hasModifier(unit, 'Self_Action.Transport')) return false
	if (unit.rescuedUnit) return false
	return teamHasAirControl(map, unit.team)
}

export type AirLiftResult =
	| { ok: true; transportTile: number }
	| { ok: false; reason: 'no-unit' | 'cannot-air-lift' }

export const airLift = (map: MapObject | MapProcesser, unitTile: number): AirLiftResult => {
	const unit = map.layers.units[unitTile]
	if (!unit) return { ok: false, reason: 'no-unit' }
	if (!canAirLift(map, unitTile)) return { ok: false, reason: 'cannot-air-lift' }

	const transport: UnitObject = {
		type: TRANSPORTER_TYPE,
		state: 0,
		team: unit.team,
		health: unitData[TRANSPORTER_TYPE].health,
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

// A paraglider / sea transport disembarks its passenger onto the very tile it
// occupies — never an adjacent one. The drop is only legal where the carried unit
// could actually stand, so a Leviathan must be sitting on a shore/port and an air
// Transporter over passable ground; otherwise there's nowhere to land and the
// transport has to move onto a valid tile first.
export const landTiles = (map: MapObject | MapProcesser, transportTile: number): number[] => {
	const transport = map.layers.units[transportTile]
	if (!transport || !transport.rescuedUnit) return []
	const rescued = transport.rescuedUnit
	const mapWithSky = map as MapObject

	const ground = map.layers.ground[transportTile]
	if (!ground) return []
	if (!validTerrain(ground, rescued)) return []
	const sky = mapWithSky.layers.sky ? mapWithSky.layers.sky[transportTile] : null
	const cost = drag(rescued, ground, sky ?? undefined)
	if (cost >= 100) return []
	return [transportTile]
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
