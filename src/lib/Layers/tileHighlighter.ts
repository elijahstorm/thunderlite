import { generateAttackList } from '$lib/Engine/Interactor/attack'
import { writable } from 'svelte/store'

export const route = writable<number[]>([])

export const highlightMovementList = (map: MapObject, tiles: number[], unit: UnitObject) => {
	map.highlights = new Array(map.cols * map.rows)
	tiles
		.reduce(
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
		.map((tile) => {
			map.highlights[tile.tile] = tile
		})
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
