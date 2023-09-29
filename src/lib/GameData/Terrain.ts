import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type TerrainData = {
	sprite: string
	yOffset: number
	xOffset: number
}

const localData = [
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
		xOffset: 0,
		yOffset: 0,
	},
] as TerrainData[]

export const terrainData = imageLazyLoader('ground', localData)
