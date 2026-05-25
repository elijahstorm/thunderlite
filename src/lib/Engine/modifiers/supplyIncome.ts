import { buildingData } from '$lib/GameData/building'
import { gameState } from '$lib/Engine/gameState'
import type { ModifierContext, ModifierHandler, ModifierTarget } from './index'

export const supplyIncome: ModifierHandler = (
	target: ModifierTarget,
	ctx: ModifierContext
): void => {
	if (ctx.kind !== 'building') return

	const building = target as BuildingObject
	if (typeof building.team !== 'number') return

	const income = buildingData[building.type]?.income ?? 0
	if (income <= 0) return

	gameState.update((state) => ({
		...state,
		players: state.players.map((player) =>
			player.team === building.team ? { ...player, money: player.money + income } : player
		),
	}))
}
