import { get } from 'svelte/store'
import { unitData } from '$lib/GameData/unit'
import { gameState, markTileActed, type Player, type PlayerControls } from './gameState'

export type BuildableUnit = {
	type: number
	data: (typeof unitData)[number]
	affordable: boolean
	controlled: boolean
	buildable: boolean
}

export type SpawnResult =
	| { ok: true; tile: number }
	| { ok: false; reason: 'no-space' | 'not-affordable' | 'not-buildable' | 'invalid' }

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

export const playerCanBuildType = (
	player: Pick<Player, 'controls'>,
	unitType: 'ground' | 'air' | 'sea'
): boolean => {
	const controls: PlayerControls = player.controls ?? { ground: false, air: false, sea: false }
	return Boolean(controls[unitType])
}

export const buildableUnits = (
	player: Pick<Player, 'money' | 'controls'>,
	_building?: BuildingObject | null
): BuildableUnit[] => {
	const out: BuildableUnit[] = []
	for (let type = 0; type < unitData.length; type++) {
		const data = unitData[type]
		if (data.cost <= 0) continue
		const controlled = playerCanBuildType(player, data.type)
		const affordable = player.money >= data.cost
		out.push({
			type,
			data,
			controlled,
			affordable,
			buildable: controlled && affordable,
		})
	}
	return out
}

export const spawnBuiltUnit = (
	map: MapObject | MapProcesser,
	buildingTile: number,
	unitType: number,
	team: number
): SpawnResult => {
	const data = unitData[unitType]
	if (!data) return { ok: false, reason: 'invalid' }

	const state = get(gameState)
	const player = state.players.find((p) => p.team === team)
	if (!player) return { ok: false, reason: 'invalid' }
	if (data.cost <= 0) return { ok: false, reason: 'not-buildable' }
	if (!playerCanBuildType(player, data.type)) return { ok: false, reason: 'not-buildable' }
	if (player.money < data.cost) return { ok: false, reason: 'not-affordable' }

	const candidates = [buildingTile, ...adjacentTiles(map, buildingTile)]
	const spawnTile = candidates.find((tile) => map.layers.units[tile] == null)
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

	return { ok: true, tile: spawnTile }
}
