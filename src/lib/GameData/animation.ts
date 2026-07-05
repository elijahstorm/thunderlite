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
	// Secondary-hit effects painted on the tiles a weapon reaches beyond the one it
	// aimed at (splash neighbours, a lance's passthrough tile, scorched forest).
	// Same 56x96 / offset geometry as the explosion so they seat on a tile the same
	// way; each carries the flavor of the attack that threw it.
	{
		url: '/game/play/animation/tile-flame.png',
		frames: 10,
		xOffset: -2,
		yOffset: 36,
		width: 56,
		height: 96,
		name: 'Flame',
		type: 'tile',
	},
	{
		url: '/game/play/animation/tile-shrapnel.png',
		frames: 10,
		xOffset: -2,
		yOffset: 36,
		width: 56,
		height: 96,
		name: 'Shrapnel',
		type: 'tile',
	},
	{
		url: '/game/play/animation/tile-pierce.png',
		frames: 10,
		xOffset: -2,
		yOffset: 36,
		width: 56,
		height: 96,
		name: 'Pierce',
		type: 'tile',
	},
]

export const animationRenderer = imageLazyLoader('animation' as keyof MapLayers, animationData)

// Named indices into `animationData` — keep colocated with the registry above so
// renaming/reordering entries surfaces every consumer in one place.
export const ANIMATION_EXPLOSION = 0
export const ANIMATION_POINTER = 1
export const ANIMATION_SELECT = 2
export const ANIMATION_FLAME = 3
export const ANIMATION_SHRAPNEL = 4
export const ANIMATION_PIERCE = 5

// Maps a secondary-hit flavor to its tile-effect sheet. Keyed by the same union
// the combat side chooses (see `SecondaryEffectKind`), kept here so the animator
// resolves flavor -> sheet in one place.
export const SECONDARY_EFFECT_ANIMATION: Record<'flame' | 'shrapnel' | 'pierce', number> = {
	flame: ANIMATION_FLAME,
	shrapnel: ANIMATION_SHRAPNEL,
	pierce: ANIMATION_PIERCE,
}
