import { imageLazyLoader } from '$lib/Sprites/imageLazyLoader'

type UnitData = {
	//
}

const localData = [
	{
		sprite: 'game/play/units/idle/Strike Commando.png',
	},
	{
		sprite: 'game/play/units/idle/Flak Tank.png',
	},
] as UnitData[]

export const unitData = imageLazyLoader('units', localData)
