import { buildingData } from '$lib/GameData/building'
import { gameState } from '$lib/Engine/gameState'
import type { ModifierContext, ModifierHandler, ModifierTarget } from './index'

// Once a building's funds reservoir runs dry it keeps paying, but only this
// fraction of its rated income — a permanent trickle rather than going silent.
export const DEPLETED_INCOME_FACTOR = 0.25

export const supplyIncome: ModifierHandler = (
	target: ModifierTarget,
	ctx: ModifierContext
): void => {
	if (ctx.kind !== 'building') return

	const building = target as BuildingObject
	if (typeof building.team !== 'number') return

	const data = buildingData[building.type]
	const income = data?.income ?? 0
	if (income <= 0) return

	// `resources` is the building's funds reservoir. A type with no reservoir
	// (resources = 0) pays its flat income forever — the original behavior.
	const reservoir = data?.resources ?? 0
	let payout = income
	if (reservoir > 0) {
		const remaining =
			typeof building.resources === 'number' ? building.resources : reservoir
		if (remaining > 0) {
			// Draw this turn's payout from the reservoir; the last withdrawal is
			// capped at whatever is left.
			payout = Math.min(income, remaining)
			building.resources = remaining - payout
		} else {
			// Drained: only a reduced trickle from here on.
			payout = Math.max(1, Math.round(income * DEPLETED_INCOME_FACTOR))
			building.resources = 0
		}
	}

	gameState.update((state) => ({
		...state,
		players: state.players.map((player) =>
			player.team === building.team ? { ...player, money: player.money + payout } : player
		),
	}))
}
