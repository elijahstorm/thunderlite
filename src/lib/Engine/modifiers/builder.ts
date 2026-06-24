import { unitData } from '$lib/GameData/unit'
import { terrainData } from '$lib/GameData/terrain'
import { markTileActed } from '$lib/Engine/gameState'
import { walletOf } from '$lib/Engine/wallet'
import { validTerrain } from '$lib/Engine/Interactor/Pathing/movement'

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

export const passableAdjacentTiles = (map: MapObject | MapProcesser, tile: number): number[] =>
	adjacentTiles(map, tile).filter((t) => {
		if (map.layers.units[t] != null) return false
		const ground = map.layers.ground[t]
		if (!ground) return false
		const terrain = terrainData[ground.type]
		if (!terrain) return false
		if (terrain.details === 'impassable') return false
		return true
	})

// Adjacent tiles a *specific* unit type could legally be deployed onto: open (no
// occupant) and terrain the unit can actually exist on (e.g. a ground unit can't
// be built onto open water, a ship can't be built onto land). This is the gate
// the directional build picker paints — every highlighted tile is a tile the
// chosen unit can stand on.
export const buildableAdjacentTiles = (
	map: MapObject | MapProcesser,
	tile: number,
	unitType: number
): number[] =>
	adjacentTiles(map, tile).filter((t) => {
		if (map.layers.units[t] != null) return false
		const ground = map.layers.ground[t]
		if (!ground) return false
		return validTerrain(ground, { type: unitType } as UnitObject)
	})

export type BuildAdjacentResult =
	| { ok: true; tile: number }
	| { ok: false; reason: 'no-space' | 'not-affordable' | 'not-buildable' | 'invalid' }

export const buildAdjacent = (
	map: MapObject | MapProcesser,
	builderTile: number,
	unitType: number,
	team: number,
	destination?: number
): BuildAdjacentResult => {
	const data = unitData[unitType]
	if (!data) return { ok: false, reason: 'invalid' }
	if (data.cost <= 0) return { ok: false, reason: 'not-buildable' }

	// A Warmachine is a self-contained mobile factory: it can build any unit type
	// regardless of which factories the player owns, paying out of its own wallet
	// (refilled by mining) rather than the shared player money pool.
	const builder = map.layers.units[builderTile]
	if (!builder) return { ok: false, reason: 'invalid' }
	const funds = walletOf(builder)
	if (funds < data.cost) return { ok: false, reason: 'not-affordable' }

	const adjacencies = buildableAdjacentTiles(map, builderTile, unitType)
	const spawnTile =
		typeof destination === 'number' && adjacencies.includes(destination)
			? destination
			: adjacencies[0]
	if (typeof spawnTile !== 'number') return { ok: false, reason: 'no-space' }

	map.layers.units[spawnTile] = {
		type: unitType,
		state: 0,
		team,
		health: data.health,
	}

	builder.wallet = funds - data.cost

	markTileActed(spawnTile)
	markTileActed(builderTile)

	return { ok: true, tile: spawnTile }
}
