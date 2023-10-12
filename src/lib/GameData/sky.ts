import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type SkyData = SpriteObject & {
	//
}

export const skyData = [
	{
		url: '/game/play/weather/cloud.png',
		frames: 5,
		xOffset: 0,
		yOffset: 0,
	},
	{
		url: '/game/play/weather/storm.png',
		frames: 5,
		xOffset: 0,
		yOffset: 0,
	},
] as SkyData[]

export const skyRenderer = imageLazyLoader('sky', skyData)
