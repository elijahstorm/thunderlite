import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { terrainData } from '$lib/GameData/terrain'
import { gameState, markTileActed } from '$lib/Engine/gameState'
import { playerCanBuildType } from '$lib/Engine/build'

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

	const state = get(gameState)
	const player = state.players.find((p) => p.team === team)
	if (!player) return { ok: false, reason: 'invalid' }
	if (!playerCanBuildType(player, data.type)) return { ok: false, reason: 'not-buildable' }
	if (player.money < data.cost) return { ok: false, reason: 'not-affordable' }

	const adjacencies = passableAdjacentTiles(map, builderTile)
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

	gameState.update((s) => ({
		...s,
		players: s.players.map((p) => (p.team === team ? { ...p, money: p.money - data.cost } : p)),
	}))

	markTileActed(spawnTile)
	markTileActed(builderTile)

	return { ok: true, tile: spawnTile }
}
