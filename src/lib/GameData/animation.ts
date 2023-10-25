import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type AnimationData = ObjectAssetMeta & {
	width: number
	height: number
	name: string
	type: 'ui' | 'tile' | 'atmosphere'
}

export const animationData: AnimationData[] = [
	{
		url: '/game/play/animation/tile-explosion.png',
		frames: 12,
		xOffset: -2,
		yOffset: 36,
		width: 56,
		height: 96,
		name: 'Explosion',
		type: 'tile',
	},
	{
		url: '/game/play/animation/tile-pointer.png',
		frames: 4,
		xOffset: 0,
		yOffset: 0,
		width: 60,
		height: 60,
		name: 'Pointer',
		type: 'tile',
	},
	{
		url: '/game/play/animation/tile-select.png',
		frames: 2,
		xOffset: 0,
		yOffset: 0,
		width: 60,
		height: 60,
		name: 'Select',
		type: 'tile',
	},
]

export const animationRenderer = imageLazyLoader('animation' as keyof MapLayers, animationData)
