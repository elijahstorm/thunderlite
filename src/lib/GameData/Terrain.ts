import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type TerrainData = {
	//
}

const localData = [
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
	},
	{
		sprite: 'game/play/terrain/bridge/bridge.png',
	},
] as TerrainData[]

export const terrainData = imageLazyLoader('ground', localData)
