import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'
import type { modifierData } from './modifier'

type SkyData = ObjectAssetMeta & {
	name: string
	description: string
	protection: number
	drag: number
	modifiers: (keyof typeof modifierData)[]
}

export const skyData: SkyData[] = [
	{
		url: '/game/play/weather/cloud.png',
		frames: 5,
		xOffset: 0,
		yOffset: 0,
		name: 'Cloud',
		description: 'Cloud cover helps hide air units from enemy sight.',
		protection: 0.2,
		drag: 2,
		modifiers: ['hidden'],
	},
	{
		url: '/game/play/weather/storm.png',
		frames: 5,
		xOffset: 0,
		yOffset: 0,
		name: 'Storm',
		description:
			'Dangerous air, but may be helpful to hide from enemies when there is nothing better.',
		protection: 0.2,
		drag: 2,
		modifiers: ['hidden', 'treacherous'],
	},
]

export const skyRenderer = imageLazyLoader('sky', skyData)
