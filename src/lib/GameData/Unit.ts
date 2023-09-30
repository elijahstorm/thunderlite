import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type UnitData = SpriteObject & {
	//
}

const localData = [
	{
		url: 'game/play/units/idle/strike-commando.png',
		yOffset: 0,
		xOffset: 0,
	},
	{
		url: 'game/play/units/idle/flak-tank.png',
		yOffset: 60,
		xOffset: 0,
	},
] as UnitData[]

export const unitData = imageLazyLoader('units', localData)
