import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type UnitData = SpriteObject & {
	//
}

export const unitData = [
	{
		url: 'game/play/units/idle/strike-commando.png',
		frames: 4,
		yOffset: 0,
		xOffset: 0,
	},
	{
		url: 'game/play/units/idle/flak-tank.png',
		frames: 4,
		yOffset: 60,
		xOffset: 0,
	},
] as UnitData[]

export const unitRenderer = imageLazyLoader('units', unitData)
