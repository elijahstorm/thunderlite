import { generateAttackList } from '$lib/Engine/Interactor/attack'
import { writable } from 'svelte/store'

type HighlightType = 'none' | 'move' | 'attack'

type HighlightMeta = {
	type: HighlightType
	tip: 'good' | 'bad' | 'neutral'
}

type TileInfo = {
	tile: {
		x: number
		y: number
	}
}

type Highlight = TileInfo & HighlightMeta

export const highlightedTiles = writable<Highlight[]>([])

export const route = writable<number[]>([])

export const highlightMovementList = (map: MapObject, tiles: number[], unit: UnitObject) =>
	highlightedTiles.set(
		[
			...new Set(
				tiles
					.reduce(
						(highlights, tile) => [
							...highlights,
							...pathToHighlightable(map, generateAttackList(map, tile, unit), 'attack'),
						],
						pathToHighlightable(map, tiles, 'move')
					)
					.map(JSON.stringify)
			),
		].map(JSON.parse)
	)

const pathToHighlightable = (map: MapObject, tiles: number[], type: HighlightType) =>
	tiles.map<Highlight>((tile) => ({
		tile: {
			x: tile % map.cols,
			y: Math.floor(tile / map.rows),
		},
		type,
		tip: 'neutral',
	}))

const removeDuplicates = () => [true]
