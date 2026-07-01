import { unitData } from '$lib/GameData/unit'
import { scoreAttack } from '$lib/Engine/cpuAi/score'

// Advice-badge rows on the sprite sheet, best to worst: 0 good, 1 neutral, 2 bad,
// 3 terrible. Both the move-advice and attack-advice columns share these rows.
export type AdviceTip = 0 | 1 | 2 | 3

// Rates a potential attack launched from `attackerTile` against the enemy on
// `defenderTile`. Reuses the CPU's own combat forecast (damage out, counter back,
// whether the shot kills) so the badge the player sees agrees with how the AI
// values the same trade. The verdict is the net HP swing, expressed as fractions
// of each unit's *current* health so a near-dead attacker chipping a healthy tank
// reads as the bad idea it is.
export const attackAdviceTip = (
	map: MapObject,
	attacker: UnitObject,
	attackerTile: number,
	defender: UnitObject,
	defenderTile: number
): AdviceTip => {
	const { damage, returnDamage, killsTarget } = scoreAttack(
		map,
		attacker,
		attackerTile,
		defender,
		defenderTile
	)

	// A kill (which also means no counter lands) is always the green light.
	if (killsTarget) return 0

	const defMax = unitData[defender.type]?.health ?? 1
	const atkMax = unitData[attacker.type]?.health ?? 1
	const defCurrent = defender.health ?? defMax
	const atkCurrent = attacker.health ?? atkMax

	const dealt = defCurrent > 0 ? Math.min(1, damage / defCurrent) : 0
	const taken = atkCurrent > 0 ? Math.min(1, returnDamage / atkCurrent) : 0
	const net = dealt - taken

	if (net >= 0.34) return 0 // clearly come out ahead
	if (net > -0.15) return 1 // roughly even trade
	if (net > -0.5) return 2 // you take the worse end of it
	return 3 // you barely scratch them and eat a heavy counter
}

// Rates ending a move on a tile given the total incoming HP an enemy turn could
// land there (see computeThreatSeverity). 0 incoming means the tile is safe and
// gets the empty `good` row — only tiles a unit can actually be hurt on warn.
export const moveAdviceTip = (unit: UnitObject, incoming: number): AdviceTip => {
	if (incoming <= 0) return 0
	const max = unitData[unit.type]?.health ?? 1
	const current = unit.health ?? max
	if (incoming >= current) return 3 // lethal: they can finish you here
	const frac = current > 0 ? incoming / current : 0
	if (frac < 0.34) return 1 // chip damage
	if (frac < 0.75) return 2 // a real beating
	return 3 // crippling
}
