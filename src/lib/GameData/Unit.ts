import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type UnitData = {
	sprite: string
	yOffset: number
	xOffset: number
}

const localData = [
	{
		sprite: 'game/play/units/idle/Strike Commando.png',
		yOffset: 0,
		xOffset: 0,
	},
	{
		sprite: 'game/play/units/idle/Flak Tank.png',
		yOffset: 60,
		xOffset: 0,
	},
] as UnitData[]

export const unitData = imageLazyLoader('units', localData)
