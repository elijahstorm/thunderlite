import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type SkyData = SpriteObject & {
	//
}

const localData = [
	{
		url: 'game/play/weather/cloud/0.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		url: 'game/play/weather/cloud/1.png',
		xOffset: 0,
		yOffset: 0,
	},
] as SkyData[]

export const skyData = imageLazyLoader('sky', localData)
