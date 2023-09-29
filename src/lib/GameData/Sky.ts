import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type SkyData = {
	sprite: string
	yOffset: number
	xOffset: number
}

const localData = [
	{
		sprite: 'game/play/weather/cloud/cloud.png',
		xOffset: 0,
		yOffset: 0,
	},
	{
		sprite: 'game/play/weather/cloud/cloud1.png',
		xOffset: 0,
		yOffset: 0,
	},
] as SkyData[]

export const skyData = imageLazyLoader('sky', localData)
