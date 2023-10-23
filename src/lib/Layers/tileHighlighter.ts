import { pathFinder } from '$lib/Engine/Interactor/Pathing/pathFinder'
import { generateAttackList } from '$lib/Engine/Interactor/Pathing/attack'
import { generateMovementList } from '$lib/Engine/Interactor/Pathing/movement'
import { unitData } from '$lib/GameData/unit'

export const updateRoute = (
	map: MapObject,
	selected: number | null,
	route: (Route | undefined)[],
	tile: number
) => {
	const unit = selected !== null && map.layers.units[selected]
	if (!unit) return []

	const allActions = generateActionsList(map, selected, unit)
	if (!allActions.find((action) => action.tile === tile)) return []

	const updated = new Array<Route | undefined>(map.cols * map.rows)
	const path = pathFinder(map, unit, selected, tile)

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

export const highlightActionsList = (map: MapObject, highlights: Highlight[]) => {
	map.highlights = new Array(map.cols * map.rows)
	highlights.map((tile) => {
		map.highlights[tile.tile] = tile
	})
}

export const generateActionsList = (map: MapObject, tile: number, unit: UnitObject) => {
	const tiles = generateMovementList(map, tile, unit)

	if (unitData[unit.type].range[0] !== 1) {
		return [
			...convertToHighlightable(map, tiles, highlightTypes.move),
			...convertToHighlightable(map, generateAttackList(map, tile, unit), highlightTypes.attack),
		]
	}

	return tiles.reduce(
		(highlights, tile) => [
			...highlights,
			...convertToHighlightable(map, generateAttackList(map, tile, unit), highlightTypes.attack),
		],
		convertToHighlightable(map, tiles, highlightTypes.move)
	)
}

const convertToHighlightable = (map: MapObject, tiles: number[], type: HighlightType) =>
	tiles.map<Highlight>((tile) => ({
		tile,
		type,
		tip: highlightTypes.neutral,
	}))

const highlightTypes = {
	move: 0,
	attack: 1,
	good: 0,
	neutral: 1,
	bad: 2,
	terrible: 3,
} as const
