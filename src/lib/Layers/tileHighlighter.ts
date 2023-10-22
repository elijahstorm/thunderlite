import { generateAttackList } from '$lib/Engine/Interactor/attack'
import { generateMovementList } from '$lib/Engine/Interactor/movement'
import { writable } from 'svelte/store'

export const route = writable<number[]>([])

export const highlightActionsList = (map: MapObject, highlights: Highlight[]) => {
	map.highlights = new Array(map.cols * map.rows)
	highlights.map((tile) => {
		map.highlights[tile.tile] = tile
	})
}

export const generateActionsList = (map: MapObject, tile: number, unit: UnitObject) => {
	const tiles = generateMovementList(map, tile, unit)
	return tiles.reduce(
		(highlights, tile) => [
			...highlights,
			...pathToHighlightable(
				map,
				generateAttackList(
					map,
					tile,
					unit,
					highlights.map((meta) => meta.tile)
				),
				highlightTypes.attack
			),
		],
		pathToHighlightable(map, tiles, highlightTypes.move)
	)
}

const pathToHighlightable = (map: MapObject, tiles: number[], type: HighlightType) =>
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
