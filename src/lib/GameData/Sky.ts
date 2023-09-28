import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type SkyData = {
	//
}

const localData = [
	{
		sprite: 'game/play/weather/cloud/cloud.png',
	},
	{
		sprite: 'game/play/weather/cloud/cloud1.png',
	},
] as SkyData[]

export const skyData = imageLazyLoader('sky', localData)
