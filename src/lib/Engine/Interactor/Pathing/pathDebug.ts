// DEV TOOL — movement/pathfinding diagnostics. Mounted only when `dev` is true
// (see PathDebugPanel mounts in the play + /dev/los pages), so it's stripped from
// production builds. Surfaces, live on hover, the values behind movement bugs:
// the flood-fill move set, pathFinder's route, and the live cursor-traced route.
import { writable } from 'svelte/store'
import { generateMovementList, drag } from './movement'
import { pathFinder } from './pathFinder'
import { generateActionsList } from '$lib/Layers/tileHighlighter'
import { terrainData } from '$lib/GameData/terrain'
import { unitData } from '$lib/GameData/unit'

export const pathDebugEnabled = writable(false)

export type PathDebugInfo = {
	source: number
	unitType: string
	movement: number
	hovered: number
	hoveredXY: string
	terrain: string
	enterDrag: number
	inMoveList: boolean
	inActionsList: boolean
	pathFound: boolean
	pathLen: number
	pathCost: number
	path: number[]
	// LIVE route state — what's actually drawn/used in-game (cursor-traced), as
	// opposed to the fresh pathFinder route above. This is where the real bug lives.
	pathHistory: number[]
	pathHistoryCost: number
	pathHistoryEndsAtHovered: boolean
	hoveredHasArrow: boolean
	arrowTiles: number[]
	moveListCount: number
	// Green (flood-fill) move tiles that pathFinder fails to route to — the desync
	// that drops the hover arrow and cancels the click. Empty list == healthy.
	desyncTiles: number[]
}

export const pathDebug = writable<PathDebugInfo | null>(null)

const xy = (map: MapObject, tile: number) => `${tile % map.cols},${Math.floor(tile / map.cols)}`

const routeCost = (map: MapObject, unit: UnitObject, path: number[]): number => {
	let total = 0
	for (let i = 1; i < path.length; i++) {
		total += drag(unit, map.layers.ground[path[i]], map.layers.sky[path[i]])
	}
	return total
}

export const analyzePathDebug = (
	map: MapObject,
	source: number | null,
	hovered: number
): void => {
	if (source === null) {
		pathDebug.set(null)
		return
	}
	const unit = map.layers.units[source]
	if (!unit) {
		pathDebug.set(null)
		return
	}

	const moveList = generateMovementList(map, source, unit)
	const moveSet = new Set(moveList)
	const actions = generateActionsList(map, source, unit)
	const actionMoveTiles = new Set(actions.filter((a) => a.type === 0).map((a) => a.tile))

	// For every reachable green tile, does pathFinder produce a route? Tiles that
	// don't (other than the source itself) are a pathfinding desync made visible.
	const desyncTiles = moveList.filter(
		(t) => t !== source && pathFinder(map, unit, source, t).length === 0
	)

	const path = pathFinder(map, unit, source, hovered)

	// The live, cursor-driven route as the renderer/click actually see it.
	const pathHistory = map.pathHistory ?? []
	const route = map.route ?? []
	const arrowTiles: number[] = []
	route.forEach((cell, tile) => {
		if (cell) arrowTiles.push(tile)
	})

	pathDebug.set({
		source,
		unitType: unitData[unit.type]?.name ?? String(unit.type),
		movement: unitData[unit.type].movement,
		hovered,
		hoveredXY: xy(map, hovered),
		terrain: terrainData[map.layers.ground[hovered]?.type]?.name ?? '—',
		enterDrag: drag(unit, map.layers.ground[hovered], map.layers.sky[hovered]),
		inMoveList: moveSet.has(hovered),
		inActionsList: actionMoveTiles.has(hovered),
		pathFound: path.length > 0,
		pathLen: path.length,
		pathCost: routeCost(map, unit, path),
		path,
		pathHistory,
		pathHistoryCost: routeCost(map, unit, pathHistory),
		pathHistoryEndsAtHovered: pathHistory[pathHistory.length - 1] === hovered,
		hoveredHasArrow: !!route[hovered],
		arrowTiles,
		moveListCount: moveList.length,
		desyncTiles,
	})
}
