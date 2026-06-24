import { pathFinder } from '$lib/Engine/Interactor/Pathing/pathFinder'
import { generateAttackList, shadowedAttackTiles } from '$lib/Engine/Interactor/Pathing/attack'
import { generateMovementList, drag } from '$lib/Engine/Interactor/Pathing/movement'
import { unitThreatTiles } from '$lib/Engine/Interactor/Pathing/threat'
import { concealedEnemyTiles } from '$lib/Engine/visibility'
import { unitData } from '$lib/GameData/unit'

export type HoverRouteResult = {
	pathHistory: number[]
	route: (Route | undefined)[]
}

// Builds the visible move-arrows from the user's hover history. The history is
// a cursor-driven sequence the player extends one tile at a time; revisiting a
// tile truncates back to that point. We fall back to BFS only when the cursor
// jumps non-adjacently, so users can pick an exact approach (e.g. which side
// they attack from) rather than relying on the pathfinder's tie-break.
export const updateRoute = (
	map: MapObject,
	selected: number | null,
	pathHistory: number[],
	tile: number
): HoverRouteResult => {
	if (selected === null) return { pathHistory: [], route: [] }
	const unit = map.layers.units[selected]
	if (!unit) return { pathHistory: [], route: [] }

	const allActions = generateActionsList(map, selected, unit)
	const action = findActionAtTile(allActions, tile)
	if (!action) {
		// Cursor is off any actionable tile. Keep history alive so the user can
		// re-enter the action zone without losing their built-up route, but show
		// no arrows for now.
		const kept = pathHistory.length && pathHistory[0] === selected ? pathHistory : [selected]
		return { pathHistory: kept, route: [] }
	}

	const concealed = concealedEnemyTiles(map, unit.team)
	const newPath = nextHoverPath(map, unit, selected, pathHistory, tile, action, concealed)
	return { pathHistory: newPath, route: routeFromPath(map, newPath) }
}

const nextHoverPath = (
	map: MapObject,
	unit: UnitObject,
	source: number,
	pathHistory: number[],
	hovered: number,
	action: TileHighlight,
	concealed: ReadonlySet<number>
): number[] => {
	const path = pathHistory.length && pathHistory[0] === source ? pathHistory.slice() : [source]

	if (hovered === source) return [source]

	const isMelee = unitData[unit.type].range[0] === 1

	if (action.type === 1) {
		// Hovering an enemy. Do not append the enemy tile — the route ends on the
		// last walkable tile adjacent to it. Ranged units don't move at all.
		if (!isMelee) return [source]

		const last = path[path.length - 1]
		const lastIsClear = last === source || !map.layers.units[last]
		if (areAdjacent(map, last, hovered) && lastIsClear) {
			return path
		}

		const fallback = pathFinder(map, unit, source, hovered, concealed)
		return fallback.length ? fallback : [source]
	}

	// Move target. Truncation has priority so backtracking the cursor erases the
	// later steps the user already moved past.
	const idx = path.indexOf(hovered)
	if (idx >= 0) return path.slice(0, idx + 1)

	const last = path[path.length - 1]
	if (areAdjacent(map, last, hovered)) {
		const extended = [...path, hovered]
		if (pathWithinBudget(map, unit, extended)) return extended
	}

	const fallback = pathFinder(map, unit, source, hovered, concealed)
	if (fallback.length) return fallback
	return path
}

const areAdjacent = (map: MapObject, a: number, b: number): boolean => {
	if (a === b) return false
	const ax = a % map.cols
	const bx = b % map.cols
	const ay = Math.floor(a / map.cols)
	const by = Math.floor(b / map.cols)
	return (Math.abs(ax - bx) === 1 && ay === by) || (Math.abs(ay - by) === 1 && ax === bx)
}

const pathWithinBudget = (map: MapObject, unit: UnitObject, path: number[]): boolean => {
	const budget = unitData[unit.type].movement
	let total = 0
	for (let i = 1; i < path.length; i++) {
		total += drag(unit, map.layers.ground[path[i]], map.layers.sky[path[i]])
		if (total > budget) return false
	}
	return true
}

const routeFromPath = (map: MapObject, path: number[]): (Route | undefined)[] => {
	const updated = new Array<Route | undefined>(map.cols * map.rows)
	if (path.length < 2) return updated

	path.forEach((tile, index) => {
		let state = 0
		let rotate = 0

		if (index === 0) {
			state = 0

			const nextTile = path[index + 1]
			if (tile + 1 === nextTile) {
				rotate = 3
			} else if (tile - map.cols === nextTile) {
				rotate = 2
			} else if (tile - 1 === nextTile) {
				rotate = 1
			}
		} else if (index === path.length - 1) {
			state = 3

			const lastTile = path[index - 1]
			if (lastTile - 1 === tile) {
				rotate = 2
			} else if (lastTile + map.cols === tile) {
				rotate = 1
			} else if (lastTile - map.cols === tile) {
				rotate = 3
			}
		} else {
			const nextTile = path[index + 1]
			const lastTile = path[index - 1]

			if (nextTile % map.cols === lastTile % map.cols) {
				state = 2
				rotate = 1
			} else if (Math.floor(nextTile / map.cols) === Math.floor(lastTile / map.cols)) {
				state = 2
			} else if (nextTile % map.cols > lastTile % map.cols) {
				state = 1

				if (nextTile < lastTile) {
					if (nextTile - 1 === tile) {
						rotate = 1
					} else {
						rotate = 3
					}
				} else if (nextTile - map.cols === tile) {
					rotate = 2
				}
			} else if (nextTile % map.cols < lastTile % map.cols) {
				state = 1

				if (nextTile < lastTile) {
					if (nextTile + 1 === tile) {
						rotate = 2
					}
				} else if (nextTile + 1 === tile) {
					rotate = 3
				} else {
					rotate = 1
				}
			}
		}

		updated[tile] = { state, rotate, index }
	})

	return updated
}

export const highlightActionsList = (map: MapObject, highlights: TileHighlight[]) => {
	map.highlights = new Array(map.cols * map.rows)
	highlights.map((tile) => {
		map.highlights[tile.tile] = tile
	})
}

// Resolve the actionable entry for a tile. Firing-shadow tiles (ranged units)
// are visual-only — they carry the attack `type` but aren't targetable, and
// generateActionsList intentionally lists them FIRST so the real move/attack
// overlays paint over them (highlightActionsList is last-write-wins). A plain
// `.find()` therefore returns the shadow entry on any tile that's *also* a move
// tile, mislabelling a walkable tile as an attack — which silently kills the
// hover arrow and cancels the click for indirect units. Skip shadows so
// interaction always resolves to the real move/attack action.
export const findActionAtTile = (
	actions: TileHighlight[],
	tile: number
): TileHighlight | undefined => actions.find((a) => a.tile === tile && !a.shadowed)

export const generateActionsList = (
	map: MapObject,
	tile: number,
	unit: UnitObject,
	threat?: Set<number>
) => {
	const tiles = generateMovementList(map, tile, unit, concealedEnemyTiles(map, unit.team))

	if (unitData[unit.type].range[0] !== 1) {
		// Shadow tiles first so the real move/attack overlays overwrite them on any
		// shared tile (highlightActionsList is last-write-wins per tile).
		return [
			...convertToShadow(shadowedAttackTiles(map, tile, unit)),
			...convertToHighlightable(map, tiles, highlightTypes.move, threat, tile),
			...convertToHighlightable(map, generateAttackList(map, tile, unit), highlightTypes.attack),
		]
	}

	return tiles.reduce(
		(highlights, from) => [
			...highlights,
			...convertToHighlightable(map, generateAttackList(map, from, unit), highlightTypes.attack),
		],
		convertToHighlightable(map, tiles, highlightTypes.move, threat, tile)
	)
}

// Read-only preview of any unit's reach: green where it can move, red across the
// tiles it could attack (its danger zone, minus the tiles it can stand on).
export const generatePreviewList = (
	map: MapObject,
	tile: number,
	unit: UnitObject
): TileHighlight[] => {
	const moveTiles = generateMovementList(map, tile, unit, concealedEnemyTiles(map, unit.team))
	const standable = new Set(moveTiles)
	const attackTiles = [...unitThreatTiles(map, tile, unit)].filter((t) => !standable.has(t))
	const shadowTiles = shadowedAttackTiles(map, tile, unit).filter((t) => !standable.has(t))

	return [
		...convertToShadow(shadowTiles),
		...convertToHighlightable(map, moveTiles, highlightTypes.move, undefined, tile),
		...convertToHighlightable(map, attackTiles, highlightTypes.attack),
	]
}

// Firing-shadow tiles: dead ground an indirect unit can't shell. Carried on the
// attack channel (red family) but flagged `shadowed` so the renderer draws the
// distinct hatched/greyed overlay instead of a live target highlight.
const convertToShadow = (tiles: number[]): TileHighlight[] =>
	tiles.map((tile) => ({
		tile,
		type: highlightTypes.attack,
		tip: highlightTypes.neutral,
		shadowed: true,
	}))

const convertToHighlightable = (
	map: MapObject,
	tiles: number[],
	type: TileHighlightType,
	threat?: Set<number>,
	// The selected unit's own tile — flagged `origin` so it renders as the muted
	// "stay put / open menu" marker instead of a green move target.
	origin?: number
) =>
	tiles.map<TileHighlight>((tile) => {
		const threatened = type === highlightTypes.move && (threat?.has(tile) ?? false)
		const isOrigin = type === highlightTypes.move && tile === origin
		return {
			tile,
			type,
			// Safe move tiles use the empty `good` row so the board isn't spammed
			// with warning triangles — only tiles inside an enemy's reach get the
			// `bad` badge. Attack tiles stay neutral until shot-quality scoring lands.
			tip: threatened
				? highlightTypes.bad
				: type === highlightTypes.move
					? highlightTypes.good
					: highlightTypes.neutral,
			threatened,
			...(isOrigin ? { origin: true } : {}),
		}
	})

const highlightTypes = {
	move: 0,
	attack: 1,
	good: 0,
	neutral: 1,
	bad: 2,
	terrible: 3,
} as const
